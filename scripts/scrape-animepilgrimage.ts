/**
 * Scrape all anime pilgrimage data from api.animepilgrimage.com
 *
 * Usage: npx tsx scripts/scrape-animepilgrimage.ts
 *
 * Output: scripts/animepilgrimage-data.json
 */

const API_BASE = "https://api.animepilgrimage.com";
const CONCURRENCY = 3;
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const OUTPUT_FILE = "scripts/animepilgrimage-data.json";
const PROGRESS_FILE = "scripts/animepilgrimage-progress.json";

interface GeoFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    placeId: string;
    animeId: string;
    animeSlug: string;
    cityId: string;
  };
}

interface GeoResponse {
  type: "FeatureCollection";
  features: GeoFeature[];
}

interface AnimeDetail {
  anime: {
    docId: string;
    animeId: string;
    animeSlug: string;
    title: Record<string, string>;
    author?: Record<string, string[]>;
    studio?: Record<string, string[]>;
    synopsis?: Record<string, string>;
    [key: string]: unknown;
  };
}

interface PlaceDetail {
  placeId: string;
  animeId: string;
  animeSlug: string;
  cityId?: string;
  name: Record<string, string>;
  geo: { latitude: number; longitude: number };
  ep?: number;
  type?: string;
  image?: string;
  streetViewUrl?: string;
  copyright?: string;
  [key: string]: unknown;
}

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.warn(
          `  Retry ${attempt + 1}/${MAX_RETRIES} for ${url} (status ${res.status}), waiting ${delay}ms`
        );
        await sleep(delay);
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) throw e;
      const delay = Math.pow(2, attempt + 1) * 1000;
      console.warn(
        `  Retry ${attempt + 1}/${MAX_RETRIES} for ${url} (${e}), waiting ${delay}ms`
      );
      await sleep(delay);
    }
  }
  throw new Error(`Failed after ${MAX_RETRIES} retries: ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchInBatches<T>(
  ids: string[],
  fetchFn: (id: string) => Promise<T>,
  label: string,
  alreadyFetched: Map<string, T> = new Map()
): Promise<Map<string, T>> {
  const results = new Map(alreadyFetched);
  const remaining = ids.filter((id) => !results.has(id));

  if (remaining.length === 0) {
    console.log(`${label}: All ${ids.length} already fetched, skipping.`);
    return results;
  }

  console.log(
    `${label}: Fetching ${remaining.length} items (${results.size} already cached)...`
  );

  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (id) => {
      try {
        const result = await fetchFn(id);
        return { id, result, error: null };
      } catch (e) {
        console.error(`  Failed: ${id} - ${e}`);
        return { id, result: null, error: e };
      }
    });

    const batchResults = await Promise.all(promises);
    for (const { id, result } of batchResults) {
      if (result) results.set(id, result);
    }

    const done = Math.min(i + CONCURRENCY, remaining.length);
    if (done % 100 === 0 || done === remaining.length) {
      console.log(`  ${label}: ${done}/${remaining.length} done`);
    }

    if (i + CONCURRENCY < remaining.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}

function loadProgress(): {
  animes: Record<string, AnimeDetail>;
  places: Record<string, PlaceDetail>;
} | null {
  try {
    const data = require("fs").readFileSync(PROGRESS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function saveProgress(
  animes: Map<string, AnimeDetail>,
  places: Map<string, PlaceDetail>
) {
  const fs = require("fs");
  fs.writeFileSync(
    PROGRESS_FILE,
    JSON.stringify({
      animes: Object.fromEntries(animes),
      places: Object.fromEntries(places),
    })
  );
}

async function main() {
  const fs = require("fs");

  // Step 1: Fetch geo data
  console.log("Step 1: Fetching geo data...");
  const geoRes = await fetchWithRetry(`${API_BASE}/geo`);
  const geoData: GeoResponse = await geoRes.json();
  console.log(`  Got ${geoData.features.length} features`);

  // Extract unique anime IDs and all place IDs
  const animeIds = [
    ...new Set(geoData.features.map((f) => f.properties.animeId)),
  ];
  const placeIds = geoData.features.map((f) => f.properties.placeId);
  console.log(
    `  ${animeIds.length} unique anime, ${placeIds.length} places\n`
  );

  // Load progress if available
  const progress = loadProgress();
  const cachedAnimes = new Map<string, AnimeDetail>(
    progress ? Object.entries(progress.animes) : []
  );
  const cachedPlaces = new Map<string, PlaceDetail>(
    progress ? Object.entries(progress.places) : []
  );
  if (progress) {
    console.log(
      `Loaded progress: ${cachedAnimes.size} anime, ${cachedPlaces.size} places cached\n`
    );
  }

  // Step 2: Fetch anime details
  console.log("Step 2: Fetching anime details...");
  const animeMap = await fetchInBatches<AnimeDetail>(
    animeIds,
    async (id) => {
      const res = await fetchWithRetry(`${API_BASE}/anime/${id}`);
      return res.json();
    },
    "Anime",
    cachedAnimes
  );
  saveProgress(animeMap, cachedPlaces);
  console.log(`  Total anime fetched: ${animeMap.size}\n`);

  // Step 3: Fetch place details
  console.log("Step 3: Fetching place details...");
  const placeMap = await fetchInBatches<PlaceDetail>(
    placeIds,
    async (id) => {
      const res = await fetchWithRetry(`${API_BASE}/place/${id}`);
      return res.json();
    },
    "Places",
    cachedPlaces
  );
  console.log(`  Total places fetched: ${placeMap.size}\n`);

  // Step 4: Build final output
  console.log("Step 4: Saving final output...");
  const output = {
    scrapedAt: new Date().toISOString(),
    stats: {
      totalFeatures: geoData.features.length,
      totalAnime: animeMap.size,
      totalPlaces: placeMap.size,
    },
    anime: Object.fromEntries(animeMap),
    places: Object.fromEntries(placeMap),
    geo: geoData,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Done! Saved to ${OUTPUT_FILE}`);

  // Clean up progress file
  try {
    fs.unlinkSync(PROGRESS_FILE);
  } catch {}
}

main().catch(console.error);
