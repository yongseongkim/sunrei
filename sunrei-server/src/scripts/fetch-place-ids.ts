/// <reference types="node" />

import { NestFactory } from '@nestjs/core';
import axios from 'axios';
import { config } from 'dotenv';
import { DataSource, IsNull } from 'typeorm';
import { AppModule } from '../app.module';
import { Place } from '../model/place.entity';

config();

async function findPlaceId(place: Place): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY is not set in environment variables');
    return null;
  }

  try {
    // 1. 먼저 Nearby Search로 시도
    const nearbySearchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${place.latitude},${place.longitude}&radius=50&keyword=${encodeURIComponent(place.name)}&key=${apiKey}`;

    const nearbyResponse = await axios.get(nearbySearchUrl);

    if (nearbyResponse.data.results && nearbyResponse.data.results.length > 0) {
      // 가장 가까운 결과 반환
      return nearbyResponse.data.results[0].place_id;
    }

    // 2. Nearby Search로 못 찾으면 Text Search 시도
    const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(place.name + ' ' + place.address)}&key=${apiKey}`;

    const textResponse = await axios.get(textSearchUrl);

    if (textResponse.data.results && textResponse.data.results.length > 0) {
      // 좌표가 가장 가까운 결과 찾기
      const closest = textResponse.data.results.reduce(
        (prev: any, curr: any) => {
          const prevDist = Math.sqrt(
            Math.pow(prev.geometry.location.lat - place.latitude, 2) +
              Math.pow(prev.geometry.location.lng - place.longitude, 2),
          );
          const currDist = Math.sqrt(
            Math.pow(curr.geometry.location.lat - place.latitude, 2) +
              Math.pow(curr.geometry.location.lng - place.longitude, 2),
          );
          return currDist < prevDist ? curr : prev;
        },
      );

      return closest.place_id;
    }

    return null;
  } catch (error) {
    console.error(`Error finding place ID for ${place.name}:`, error);
    return null;
  }
}

async function main() {
  console.log(
    '🔍 Starting Google Place IDs fetch for all places in database...\n',
  );

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const placeRepository = dataSource.getRepository(Place);

  try {
    // Fetch all places from database
    const places = await placeRepository.find();
    console.log(`Found ${places.length} places in database\n`);

    if (places.length === 0) {
      console.log('No places found in database. Exiting...');
      await app.close();
      return;
    }

    let updatedCount = 0;
    let notFoundCount = 0;
    let alreadyHasIdCount = 0;

    for (const place of places) {
      // Skip if already has Google Maps ID
      if (place.googleMapsId) {
        console.log(
          `⏭️  ${place.name} - Already has Google Maps ID: ${place.googleMapsId}`,
        );
        alreadyHasIdCount++;
        continue;
      }

      console.log(`🔎 Searching for ${place.name} (${place.id})...`);
      const placeId = await findPlaceId(place);

      if (placeId) {
        console.log(`✅ Found: ${placeId}`);
        // Update the place in database
        await placeRepository.update(place.id, { googleMapsId: placeId });
        updatedCount++;
      } else {
        console.log(`❌ Not found`);
        notFoundCount++;
      }

      // API rate limiting을 위한 딜레이
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log('\n\n📊 Summary:');
    console.log('========================================');
    console.log(`Total places: ${places.length}`);
    console.log(`Already had Google Maps ID: ${alreadyHasIdCount}`);
    console.log(`Updated with new ID: ${updatedCount}`);
    console.log(`Not found: ${notFoundCount}`);

    // Show places without Google Maps ID
    const placesWithoutId = await placeRepository.find({
      where: { googleMapsId: IsNull() },
    });

    if (placesWithoutId.length > 0) {
      console.log('\n\n⚠️  Places without Google Maps ID:');
      console.log('========================================');
      for (const place of placesWithoutId) {
        console.log(`- ${place.name} (${place.id})`);
      }
    }
  } catch (error) {
    console.error('❌ Error during fetching:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
