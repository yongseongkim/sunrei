# Sunrei Redesign Implementation Spec

## Summary

Rebuild Sunrei as a map-first discovery app based on the ClaudeDesign handoff in
`/tmp/sunrei-design-v2/sunrei/project/`. Use the wireframe `*.jsx` screens, `screenshots/`,
`Sunrei Handoff.html`, and the intent captured in `chats/chat1.md` and `chat2.md`.
The wireframes are the visual source of truth. Recreate them in the existing stack without porting the
prototype's inline-style structure. Treat the public app and admin app as separate products with separate
component sets.

Target hierarchy: `Source -> Sunrei -> SunreiSpot -> Place`

- Source: channel, program, or work. `type ∈ YouTube/TV/Anime/Other`. Type drives public behavior
  (YouTube redirects out; Anime/TV/Other render a Sunrei-managed info page) but is internal-only in
  the public UI.
- Sunrei: one video or work item under a Source. It has a `summary` and a `published_at` `TIMESTAMPTZ`
  instant. `NULL` means draft; a set value means published. This matches the existing `deleted_at`
  convention.
- SunreiSpot: one mention of a place. It has `context` ("what this source says here") and spot-level
  bilingual tags; ≤5 images. A SunreiSpot ≈ one mention (one video's take on one place).
- Place: a real-world location. Google `place_id` is the dedupe key; one Place = one marker = one
  public card.

### Core decisions

- Fresh database reset. Drop the database and rebuild from a single `V1__init.sql` baseline. V1 defines
  both content and the existing auth tables. Leave auth routes, services, JWT/admin-auth behavior, and OAuth
  logic unchanged.
- One Place = one card = one marker. The card lists mentions, one row per video. A mention is unique by
  `(place_id, sunrei_id)`: if one video has multiple spots at the same place, merge them into one mention.
  Use the first spot with non-empty context as the representative row; its `spotId`, links, and tags
  represent the row. `place.mentions[]` contains `{ source, type, video=sunreiTitle, context, sunreiId,
  spotId, sunreiLink, youtubeLink? }`. Use the compact card for one mention and the rich card for two or
  more mentions. The rich header reads "In N videos." Do not collapse by source; the same channel can
  appear twice when it has two videos at the same place. A place's tags are the deduped union of all its
  spots' tags. Mention dedupe, ordering, and tag union are backend rules.
- Link ownership has one role per field. `source.external_url` is the channel/work home or watch page:
  YouTube uses it for redirect, and managed works use it as "where to watch." `sunrei.link` is the
  specific video or work-item URL. `sunrei_spot.youtube_link` is an optional timestamp/deep link into the
  video at that spot. The mention's "Watch" CTA resolves `youtubeLink ?? sunreiLink ?? source.externalUrl`.
  Tapping the source name uses `source.external_url`.
- Distance is anchored to the map center, never GPS (chat2). The list is always sorted by distance from
  the current map view center. Geolocation is optional and only seeds the initial map center: granted opens
  on the user, denied opens on Seoul. Do not add a `UserDot` anchor or center crosshair. A user re-anchors
  by searching for a location such as "Tokyo."
- The public map has three states. Nearby and source are base modes; video preview is a transient overlay
  on whichever base mode is active.
- Source mode is global and supports multiple sources. Selecting a source removes the viewport bound,
  shows all spots for the selected source(s), fits the map to those spots, and does not refresh on pan.
  `sourceIds` are comma-separated and stack. Removing the last chip returns to nearby mode.
- Nearby mode fetches by the browser map viewport bounds, represented as `swLat,swLng,neLat,neLng`.
  Treat this as a rectangular bbox from the visible map, not a GPS radius query.
- Tags live on spots, are bilingual (`label_en` + `label_ko`), and can be created on the fly. Korean
  defaults to the typed text; English also defaults to the typed text until translated. Tag filtering is
  client-side over the returned in-scope set: `/api/map` does not take `tagIds`, each `PlaceCardDTO`
  carries `tags[]`, the list filters to matches, and non-matching pins dim. The server must return
  non-matches so the map has pins to dim. The public filter surface contains bilingual tags only; there is
  no media-type or platform facet.
- Sunrei publish state uses `published_at`. Public endpoints return only sunreis with
  `published_at IS NOT NULL`, and only places/sources with at least one published sunrei. Admin sees all
  sunreis; publish sets `published_at = now()`, and unpublish sets it to `NULL`.
- Timestamp convention. Use `TIMESTAMPTZ` for all instant fields, but treat values as UTC instants in
  application code (`Instant`) and API JSON (`2026-06-18T00:00:00Z`). Do not use plain `TIMESTAMP` for
  `created_at`, `updated_at`, `deleted_at`, `published_at`, `closed_at`, or OAuth expiry.
- i18n uses `next-intl` with a `NEXT_LOCALE` cookie only. Do not add a locale route segment or i18n
  middleware; this keeps the map page persistent and preserves query-param deep links.
- Codegen paths are broken today (`../../sunrei-api/...` → non-existent `sunrei-frontend/sunrei-api`);
  fix both packages to `../../../sunrei-api/...`.
- Map queries use browser viewport bounds and parameterized PostGIS (`ST_MakeEnvelope`/`ST_Distance`),
  not raw WKT interpolation. `PlaceService.kt:66-67` currently appends the WKT string into SQL and must
  be replaced.
- Flyway is the schema source of truth, including the PostGIS extension and `sync_place_geom` trigger.
  For this redesign only, rewrite `V1__init.sql` as the full fresh baseline. Drop the database before
  `flywayMigrate`. After this reset, future schema changes are forward-only migrations again.
- Do not add bookmarking or transcripts. Support EN and KO. Keep Pretendard and the Pantone palette already
  in `globals.css`.

### Map state model (public app)

|          | Nearby (base, default)                                | Source (base, ≥1 source)                        | Video preview (transient overlay)                     |
| -------- | --------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Enter    | default / clear all                                       | select a source (search/rail)                       | tap a video row on a PlaceCard                            |
| Scope    | current viewport                                          | the source(s); viewport bound off                   | that one video's spots; bound off                         |
| List     | places in view, nearest to map center                     | all places those sources feature, nearest to center | that video's spots (SpotRows, ward-labelled)          |
| Pan/zoom | shows "Search nearby" → "Finding spots…" → reload         | just moves; no refresh, no button                  | just moves; no refresh, no button                     |
| Map      | follows the user                                          | fits to the union of all sources' spots            | fits to the video's spots                             |
| Exit     | n/a                                                       | clear chip (✕) → nearby                             | ✕ → nests: back to source base if active, else nearby |

Search is unified: a location result moves the map (stays nearby); source results add removable
filter chips (enter source mode); a video result opens its detail. Tapping a marker (any state)
focuses that one Place → detail; ✕/back returns to the list.

### Superseded design variants

The canvas includes rejected explorations. The chats converged on the rules above, so do not build these:

- Video-first feed: the feed unit is the Place (`PlaceCard`) everywhere, nearby and source
  mode. `screens-search-cases.jsx` / `screens-flow.jsx` art that says "N videos" / "one card = one
  video" is stale; take the interaction, render PlaceCard. (chat2 reconciled search-cases to Place.)
- Desktop "By source" grouping toggle (`HomeDeskB`), mobile "By channel" + media-type chips
  (`HomeMobB`), and concept-grouped sheet (`HomeMobC`): use the flat distance-first PlaceCard instead.
- Marker popover (`MarkerA`): use a bottom sheet on mobile and a detail panel on desktop.
- Grouped/`unified` search rationale frames (`screens-search-groups.jsx`, `screens-search-unified.jsx`):
  superseded by the unified 7-case search.
- Handoff §6 "only tags change": superseded by the full domain redesign chosen this project.
- Media-type facet in the v2 "✦ Filters" surface: treat it as leftover; platform stays internal.
- `UserDot`/"nearest to you"/center-crosshair framing: superseded by map-center anchor (chat2).

### Conventions

Delivery is vertical-sliced. Phase A builds the shared backend foundation and the admin slice:
admin services, admin API/routes, and the admin app. At the end of Phase A, admin can create and publish
content. Phase B builds the public services, API/routes, and public app against admin-created data.
Because the Phase A model change breaks the existing public routes, Phase A defines the full contract and
ships public-route stubs so the server compiles. Phase B replaces those stubs with real implementations.

Tasks are dependency-ordered and grouped as `A0…A6` for foundation/admin and `B0…B-app` for public work.
Each task names the relevant files and a completion check. Checkpoints are hard gates. Keep this
`SPEC.md` and the repo `AGENTS.md` domain section in sync as tasks land. References such as
`← screens-*.jsx` and `screenshots/` resolve against the v2 bundle.

---

# PHASE A · Foundation + Admin (end-to-end)

Goal: a working Google-OAuth admin that creates and publishes Sources and Sunreis with per-spot context
and bilingual tags on the new domain model. This phase covers the server (`sunrei-server`), specs
(`sunrei-api/`), and admin app (`sunrei-frontend/packages/sunrei-admin`). IDs use
`IdGenerator.generate(prefix)` with prefixes of 6 characters or fewer.

## A0 · Shared foundation: schema, tables, models

- A0-1. Rewrite `V1__init.sql` as the full fresh baseline. Include PostGIS, places, content tables, auth
  tables in their existing shape, and place dedupe. Do not create separate redesign migrations. Existing
  environments must drop the database before applying this new V1:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- All TIMESTAMPTZ columns are UTC instants in app/API code.
CREATE TABLE place (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  address VARCHAR(255) NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  google_maps_id VARCHAR(255),
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_reason VARCHAR(255),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_place_location ON place(latitude, longitude);
CREATE INDEX idx_place_is_closed ON place(is_closed);
CREATE INDEX idx_place_geom ON place USING GIST (geom);
CREATE UNIQUE INDEX idx_place_google_maps_id ON place(google_maps_id) WHERE google_maps_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_place_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER place_geom_sync
BEFORE INSERT OR UPDATE OF latitude, longitude ON place
FOR EACH ROW EXECUTE FUNCTION sync_place_geom();

CREATE TABLE source (
  id VARCHAR(32) PRIMARY KEY,
  type VARCHAR(16) NOT NULL CHECK (type IN ('YOUTUBE','TV','ANIME','OTHER')),
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255), name_ko VARCHAR(255), synopsis TEXT,
  external_url VARCHAR(512),                  -- YouTube redirect or where-to-watch (by type)
  poster_image JSONB,                         -- single MultiSizeImage
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_source_type ON source(type);
CREATE INDEX idx_source_deleted_at ON source(deleted_at);

CREATE TABLE tag (
  id VARCHAR(32) PRIMARY KEY,
  label_en VARCHAR(64) NOT NULL, label_ko VARCHAR(64) NOT NULL, description TEXT);
CREATE UNIQUE INDEX idx_tag_label_ko ON tag (lower(label_ko));

CREATE TABLE sunrei (
  id VARCHAR(32) PRIMARY KEY,
  source_id VARCHAR(32) NOT NULL REFERENCES source(id),
  published_at TIMESTAMPTZ,                    -- NULL = draft; set = published
  title VARCHAR(128) NOT NULL, summary TEXT, description TEXT, link VARCHAR(255),
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_sunrei_source_id ON sunrei(source_id);
CREATE INDEX idx_sunrei_published_at ON sunrei(published_at);
CREATE INDEX idx_sunrei_deleted_at ON sunrei(deleted_at);

CREATE TABLE sunrei_spot (
  id VARCHAR(32) PRIMARY KEY,
  title VARCHAR(128) NOT NULL, description TEXT, context TEXT, youtube_link VARCHAR(255),
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  place_id VARCHAR(32) NOT NULL REFERENCES place(id),
  sunrei_id VARCHAR(32) NOT NULL REFERENCES sunrei(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_sunrei_spot_sunrei_id_deleted_at ON sunrei_spot(sunrei_id, deleted_at);
CREATE INDEX idx_sunrei_spot_place_id_deleted_at ON sunrei_spot(place_id, deleted_at);

CREATE TABLE sunrei_spot_tags (
  sunrei_spot_id VARCHAR(32) NOT NULL REFERENCES sunrei_spot(id) ON DELETE CASCADE,
  tag_id VARCHAR(32) NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (sunrei_spot_id, tag_id));
CREATE INDEX idx_sst_tag_id ON sunrei_spot_tags(tag_id);

CREATE TABLE users (
  id VARCHAR(32) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE oauth_providers (
  id VARCHAR(32) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  provider_user_id VARCHAR(64) NOT NULL,
  provider_data TEXT,
  access_token VARCHAR(255),
  refresh_token VARCHAR(255),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider),
  UNIQUE(provider, provider_user_id));
CREATE INDEX idx_oauth_providers_user_id ON oauth_providers(user_id);
CREATE INDEX idx_oauth_providers_provider ON oauth_providers(provider);
```

- A0-2. Auth stays unchanged. Do not modify `AuthService`, `AuthRepository`, auth routes, JWT/admin-auth
  behavior, `UserTable`, or `OAuthProviderTable`. The V1 auth table definitions mirror the existing
  migration shape. Existing OAuth behavior remains: link by OAuth provider first, then by email; newly
  created OAuth users default to `user`. Admin role setup is outside this redesign.
- A0-3. `database/SourceTable.kt` + `model/Source.kt` (+ `enum SourceType`):

```kotlin
object Sources : ULIDTimestampedTable("source", "SRC") {
  val type = varchar("type", 16); val name = varchar("name", 255)
  val nameEn = varchar("name_en",255).nullable(); val nameKo = varchar("name_ko",255).nullable()
  val synopsis = text("synopsis").nullable(); val externalUrl = varchar("external_url",512).nullable()
  val posterImage = json<MultiSizeImage>("poster_image", Json.Default).nullable()
  val deletedAt = timestamp("deleted_at").nullable()
}
enum class SourceType { YOUTUBE, TV, ANIME, OTHER }
data class Source(val id:String, val type:SourceType, val name:String, val nameEn:String?,
  val nameKo:String?, val synopsis:String?, val externalUrl:String?, val posterImage:MultiSizeImage?,
  val deletedAt:Instant?, val createdAt:Instant, val updatedAt:Instant)
```

- A0-4. `SunreiTable.kt` + `model/Sunrei.kt`: add `sourceId` (ref `Sources.id`), `summary` (text
  nullable), `publishedAt = timestamp("published_at").nullable()`; model gains `sourceId`,
  `source: Source?`, `summary`, `publishedAt: Instant?` (`val isPublished get() = publishedAt != null`);
  drops `tags`.
- A0-5. `SunreiSpotTable.kt` + `model/SunreiSpot.kt`: add `context = text("context").nullable()`;
  model gains `context: String?`, `tags: List<Tag>`.
- A0-6. `TagTable.kt` + `model/Tag.kt`: `labelEn`/`labelKo` (varchar 64), `description` nullable.
- A0-7. New `SunreiSpotTagTable.kt`; delete `SunreiTagTable.kt` and its imports:

```kotlin
object SunreiSpotTags : Table("sunrei_spot_tags") {
  val sunreiSpotId = varchar("sunrei_spot_id",32).references(SunreiSpots.id)
  val tagId = varchar("tag_id",32).references(Tags.id)
  override val primaryKey = PrimaryKey(sunreiSpotId, tagId)
}
```

- A0-8. `config/DatabaseConfig.kt`: update `SchemaUtils.create(...)` to `Places, Sources, Sunreis,
  SunreiSpots, Tags, SunreiSpotTags, UserTable, OAuthProviderTable`.
- A0-9. Repo `AGENTS.md` domain section: keep Source / spot-level Tag / Place-aggregation
  descriptions consistent (already drafted).

Checkpoint A0: `cd sunrei-server && ./gradlew flywayClean flywayMigrate showMigrations` applies the
fresh V1 baseline only.
(`compileKotlin` is not green yet because old converters/routes still reference removed fields. A3 fixes it.)

## A1 · API contract (both specs) + regen

Define the API from the wireframes first, then regenerate DTOs. The public API should return data that
directly supports PlaceCard, source mode, unified search, source intro, video preview, and video detail
without extra client joins.

- A1-1. Public shared schemas in `app-api-spec.yaml`:
  - `TagDTO{ id, labelEn, labelKo, description? }`.
  - `PlaceDTO{ id, name, address?, latitude, longitude, googleMapsId?, isClosed, closedReason?,
    closedAt?, notes?, areaLabel? }`. `areaLabel` is optional display text such as a ward or city
    derived from the address for SpotRows.
  - `SourceDTO{ id, type, name, nameEn?, nameKo?, synopsis?, externalUrl?, posterImage?, videoCount?,
    spotCount?, placeCount?, nearestDistanceMeters? }`. The client derives link labels from `type`
    and `externalUrl`.
  - `SunreiSummaryDTO{ id, sourceId, sourceName, sourceType, title, summary?, link?, images[],
    spotCount, placeCount?, areaCount?, nearestDistanceMeters? }`.
  - `SunreiSpotDTO{ id, sunreiId, title, description?, context?, youtubeLink?, images[], place, tags[],
    distanceMeters? }`.
  - `SunreiDTO{ id, sourceId, source, title, description?, summary?, link?, images[], spots[] }`.
    Sunrei-level tags are removed; tags live only on spots.
- A1-2. PlaceCard and map schemas:
  - `PlaceMentionDTO{ source, sunreiId, sunreiTitle, spotId, context?, sunreiLink?, youtubeLink?,
    images[], tags[] }`. One mention is one video row in the card. Collapse multiple spots from the
    same video at the same place into one representative mention.
  - `PlaceCardDTO{ place, distanceMeters?, mentions[], tags[], sourceCount, sunreiCount, spotCount }`.
    `tags[]` is the union of all published spots at that place and powers the client-side tag filter.
  - `ListPlacesResult{ places[], sources[]?, bounds? }`. `sources[]` is the optional source rail data
    for the current map result.
- A1-3. Detail and search result schemas:
  - `GetPlaceResult{ place, mentions[], spots[] }`.
  - `GetSourceResult{ source, sunreis[], places[]? }`. YouTube sources can still link out; Anime, TV,
    and Other sources use this response for the managed work page.
  - `GetSunreiResult{ sunrei }`.
  - `ListSourcesResult{ sources[] }`.
  - `PlaceSearchHitDTO{ place, mentionCount, sourceCount, distanceMeters? }`.
  - `SearchResult{ places[], sources[], sunreis[] }` for the wireframe groups: Areas & places,
    Channels & programs, and Videos. Google Places autocomplete can still be merged client-side for
    locations outside the Sunrei database.
- A1-4. Public endpoints in `app-api-spec.yaml`. Use `List<X>Result` for list responses,
  `Get<X>Result` for detail responses, and comma-separated query lists such as `sourceIds=a,b`.
  - `GET /api/map` → `ListPlacesResult`. Nearby mode requires browser viewport bounds
    `swLat,swLng,neLat,neLng` and accepts optional `centerLat,centerLng`. Source mode uses `sourceIds`
    and ignores viewport bounds. If `sourceIds` is present, source mode wins; otherwise bounds select
    nearby mode. No `tagIds`.
  - `GET /api/sources` → `ListSourcesResult`. Supports `q`, optional bounds, optional center, and
    returns source rail or add-source picker data with counts and nearest distance.
  - `GET /api/places/{id}`, `GET /api/sources/{id}`, and `GET /api/sunreis/{id}` accept optional
    `centerLat,centerLng` so detail views can show the same distance anchor as the map.
  - `GET /api/tags`.
  - `GET /api/search?q=` → `SearchResult`; accepts optional `centerLat,centerLng`. This is the only
    public search route.
- A1-5. Admin schemas and endpoints in `admin-api-spec.yaml`:
  - Tags are bilingual in `TagDTO`, `CreateTagRequest`, and `UpdateTagRequest`.
  - Inline Sunrei spots gain `context`, `tagIds`, and `tagLabels`; top-level Sunrei `tagIds` are removed.
  - `CreateSunreiRequest` and `UpdateSunreiRequest` gain required `sourceId`, `summary`, and
    `published`. The server maps `published=true` to `published_at=now()` when empty, and
    `published=false` to `NULL`.
  - Admin `SunreiDTO` carries `source`, `sourceId`, `summary`, and `publishedAt?`.
  - Admin source list rows expose `sunreiCount`, `spotCount`, and app behavior text for the list
    wireframe. Admin place list rows expose area, `googleMapsId`, `sourceCount`, and `spotCount`.
  - Keep `/admin/images/*`, `/admin/resources/youtube/*`, existing auth routes, and existing auth DTOs.
    Add `/admin/sources` CRUD, `/admin/places` list, `ListTagsResult.spotCountByTagId`,
    `TagWithSpots`, and detach-from-spot.
- A1-6. Regenerate DTOs. `./gradlew generateProtocols` (compile gate is A3).

## A2 · Shared + admin services & converters

- A2-1. `service/SourceService.kt`: list/get/create/update/soft-delete + `search(q)` ILIKE; DI-wire
  in `di/DIConfiguration.kt` + `di/DIExtensions.kt`.
- A2-2. `service/TagService.kt`: bilingual mapping; `findOrCreateByKoLabel(typed)` (ko=typed,
  en=typed until translated); search both labels; list returns `spotCountByTagId`; `getWithSpots`,
  `detach(tagId, spotId)`.
- A2-3. `service/SunreiService.kt` write paths: create/update take `sourceId`, `summary`, and a
  `published` boolean (true → set `published_at=now()` if currently null so the original publish time is
  preserved on re-save; false → `null`);
  spot create/update take `context` + `tagIds`/`tagLabels` (resolve via A2-2, write `SunreiSpotTags`);
  `findOrCreatePlace` dedupe by `googleMapsId` (race-safe via the unique index). Add `listBySource`.
- A2-4. `ResultRow.toPlace()` helper (shared; used by `findOrCreatePlace` now + public queries in B).
- A2-5. Admin converters (`routes/admin/converter/*`): `Source/Tag/SunreiSpot/Sunrei` → admin DTOs;
  delete the dead `toMapSpotDTO`/`toSunreiInfoDTO` here and in `routes/app/converter/*`.

## A3 · Admin routes + public-route stubs (compile gate)

- A3-1. Admin routes: add `routes/admin/{SourceRoutes,PlaceRoutes}.kt`; update
  `admin/SunreiRoutes.kt`, `admin/TagRoutes.kt`; register in `AdminRoutes.kt`. Keep Image/Resource.
- A3-2. App converters compile fix: update `routes/app/converter/*` `Tag/SunreiSpot/Sunrei` → new
  app DTOs so the app side compiles (full mapping; route logic is stubbed next).
- A3-3. Public-route stubs: `routes/app/MapRoutes.kt` and new
  `app/{PlaceRoutes,SourceRoutes,SearchRoutes}.kt` return minimal valid responses
  (`ListPlacesResult{places:[]}`, `ListSourcesResult{sources:[]}`, `SearchResult{places:[],sources:[],
  sunreis:[]}`, etc.). `app/SunreiRoutes.kt` and `app/TagRoutes.kt` may use the real implementation if
  that is simpler. Register everything in `AppRoutes.kt`. Mark each stub with
  `// STUB: real implementation in Phase B (B0/B1)`.

Checkpoint A3: `./gradlew generateProtocols compileKotlin` green; `flywayMigrate` clean.

## A4 · Admin backend verification (manual)

With the server running as `KTOR_ENV=local` against the Flyway-migrated database, verify the admin API:
using an existing admin account, create YouTube and Anime sources; create a Sunrei with `sourceId`,
`summary`, and spots carrying `context` plus `tagIds`/`tagLabels`; toggle `published=true` and confirm it
sets `published_at`; create a bilingual tag on the fly; create two spots with the same `googleMapsId` and
confirm they dedupe to one Place.

## A5 · Admin app: Sunrei form (`packages/sunrei-admin`)

Evolve the real form; don't regress dynamic spot sub-forms, sticky numbered map, 3-way Open Map
(`PlaceSearchModal`, Tokyo default), `ImageUpload` caps (10/sunrei, 5/spot). Admin is desktop-only.

- A5-1. Fix the `package.json` codegen path (`../../` → `../../../sunrei-api/`) and run `pnpm codegen`
  after A1.
- A5-2. Add `lib/schemas/{sunrei-form,source-form}.ts` and wire `zodResolver`. `zod` is already installed
  but unused today:

```ts
const placeInput = z.object({
  name,
  address,
  latitude,
  longitude,
  googleMapsId: z.string().nullable(),
});
const spotSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  context: z.string().optional(),
  youtubeLink: z.string().url().or(z.literal('')).optional(),
  place: placeInput,
  tagIds: z.array(z.string()),
  images: z.array(imageSchema).max(5),
  _delete: z.boolean().optional(),
});
const sunreiSchema = z.object({
  sourceId: z.string().min(1),
  published: z.boolean(),
  title: z.string().min(1),
  summary: z.string().optional(),
  description: z.string().optional(),
  link: z.string().optional(),
  images: z.array(imageSchema).max(10),
  spots: z.array(spotSchema),
});
const sourceSchema = z
  .object({
    type: z.enum(['YOUTUBE', 'TV', 'ANIME', 'OTHER']),
    name: z.string().min(1),
    nameEn: z.string().optional(),
    nameKo: z.string().optional(),
    synopsis: z.string().optional(),
    externalUrl: z.string().optional(),
    posterImage: imageSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'YOUTUBE' && !v.externalUrl)
      ctx.addIssue({ path: ['externalUrl'], message: 'required' });
  });
```

- A5-3. `sunrei-form/SourceSelectField.tsx`: pick an existing source or create one through the A6-2 flow.
- A5-4. `sunrei-form/SummaryField.tsx`: add an inline-editable summary with a character count. Do not add
  "✦ Regenerate" in v1; regeneration stays in the CLI workflow.
- A5-5. `sunrei-form/SpotCard.tsx`: add a `context` textarea while keeping title, description, YouTube,
  place, and image fields.
- A5-6. `sunrei-form/SpotTagAutocomplete.tsx`: support bilingual tags. Creating a tag on the fly calls
  `createTag({labelEn:typed, labelKo:typed})`. Show removable bilingual chips, following the existing
  `TagAutocomplete` behavior.
- A5-7. `SunreiForm.tsx`: add `sourceId`, `summary`, and a `published` toggle. Move tags from Sunrei to
  spots, remove Sunrei-level tags, and map the new request shape.

## A6 · Admin app: sources, places, tags, content list, nav

- A6-1. `lib/hooks/use-sources.ts`: list/get/create/update/delete.
- A6-2. `components/SourceForm.tsx`: make the form type-driven with `superRefine`. YouTube uses
  `external_url`; Anime/TV/Other use `name_en`, `name_ko`, `synopsis`, poster, and `external_url` labeled
  "where to watch" ←
  `screens-admin.jsx`.
- A6-3. `app/(dashboard)/sources/{page,new/page,[id]/edit/page}.tsx`.
- A6-4. `components/SourcesList.tsx`: type badge, Sunrei/Spot counts, app-behavior column
  (YouTube "links out ↗" vs "✦ managed page") ← `screens-admin-lists.jsx`.
- A6-5. `lib/hooks/use-places.ts` + `app/(dashboard)/places/page.tsx` + `PlacesList.tsx`: keyed by
  `google place_id`, Area(KO)/Sources/Spots columns ← `screens-admin-lists.jsx`.
- A6-6. `lib/hooks/use-tags.ts` (bilingual + `useDetachSpotFromTag`); rewrite `tags/page.tsx` +
  `tags/[id]/page.tsx`: English / 한국어 / Spots; edit translations; no inline create ← `screens-admin.jsx`.
- A6-7. `SunreisList`: evolve `sunreis/page.tsx` by adding Source/Channel and Status columns with a
  publish/unpublish toggle (sets/clears `published_at`), type + published/draft filter chips, search ←
  `screens-admin.jsx` (AdminContentList).
- A6-8. `components/AppSidebar.tsx`: Content, Channels/Sources, Places, Tags. Do not add an "Ingest" nav
  item or in-browser ingest screen; ingestion stays in the CLI workflow (A6-9), which POSTs to the admin API.
- A6-9. Update `youtube-*` skills payload: tags on spots, plus `sourceId`, `summary`, `context`, and
  `published:false` (ingests land as drafts).
- A6-10. Verify admin-gate role casing. The existing code compares `role=='admin'` (lowercase). Leave that
  behavior unchanged.

Admin screen-flow checkpoints:

- Admin source flow: Sources list → new source → edit source → source appears with type, Sunrei count,
  spot count, and app behavior.
- Admin Sunrei flow: Content list → new Sunrei → select or create source → add summary → add spots with
  context, place, images, and spot tags → save draft → publish → public APIs can see it.
- Admin place flow: Places list search → inspect Google place id, area, source count, and spot count →
  confirm duplicate Google place ids collapse to one Place.
- Admin tag flow: Tags list → tag detail → edit bilingual labels → detach a spot → tag counts update.

Checkpoint A: `pnpm --filter sunrei-admin codegen && pnpm --filter sunrei-admin build`; then run
`pnpm dev:admin`, log in, create a source, create and publish a Sunrei with per-spot tags/context, and
confirm place dedupe, tag counts, and detach. Admin is now usable to populate content for Phase B.

---

# PHASE B · Public service + app (end-to-end)

Goal: build the map-first public app against data created in Phase A. Replace public-route stubs with real
queries, then build one persistent client map page. Detail surfaces are sheets/panels, not hard routes.
Deep-link through query params and keep desktop/mobile parity.

## B0 · Public services & converters

- B0-1. `PlaceService` bounds op: parameterized `ST_MakeEnvelope(minLng,minLat,maxLng,maxLat,4326)`
  custom op (numeric params only).
- B0-2. `PlaceService` distance function: `ST_Distance(geom::geography,
  ST_MakePoint(:lng,:lat)::geography)`; reuse `ResultRow.toPlace()` (A2-4).
- B0-3. `listInBoundsWithDistance(bounds, centerLat?, centerLng?, limit)`: nearby query from the browser
  map viewport bbox. Use `ST_MakeEnvelope(swLng,swLat,neLng,neLat,4326)` and return Places with published
  spots inside that visible rectangle. `centerLat/Lng` is the map-view center (compute from `bounds` center
  if absent), not GPS. Sort by distance ascending and gate on `EXISTS` a published spot. Do not filter tags
  server-side; Bf handles client-side filtering.
- B0-4. `listBySourcesWithDistance(sourceIds, centerLat?, centerLng?)`: source mode has no viewport bound.
  Return every place featured by any selected source, nearest-to-center, published-gated.
- B0-5. `SunreiSpotService.feedByPlaces(places)`: 2 queries, group by `place_id` → PlaceCards:

```kotlin
data class PlaceMention(val source:Source, val sunreiId:String, val sunreiTitle:String,
                        val spotId:String, val context:String?, val sunreiLink:String?,
                        val youtubeLink:String?, val images:List<MultiSizeImage>, val tags:List<Tag>)
data class PlaceFeedItem(val place:Place, val distanceMeters:Double?,
                         val mentions:List<PlaceMention>, val tags:List<Tag>,
                         val sourceCount:Int, val sunreiCount:Int, val spotCount:Int)
// Q1: SunreiSpots ⨝ Sunreis ⨝ Sources WHERE place_id IN(ids) AND not-deleted
//     AND sunrei.published_at IS NOT NULL  -> spot rows
// Q2: SunreiSpotTags ⨝ Tags WHERE spot_id IN(spotIds) -> tags per spot
// mention = one per (place_id, sunrei_id): collapse multiple spots of the same video at the same
//   place into one (representative = first with non-empty context). sunreiLink = sunrei.link.
//   images = sunrei.images; mention tags = representative spot tags.
// group by place_id; order mentions (source, nearest spot, sunrei recency);
// place.tags = union of all its spots' tags (not just the representative); drop places with no published spots.
```

- B0-6. `SunreiService.getSunreiWithSpots(id)`: published sunrei + its spots (places + tags); powers
  video preview + video detail.
- B0-7. Public converters (`routes/app/converter/*`): `PlaceFeedItem`→`PlaceCardDTO`,
  `PlaceMention`→`PlaceMentionDTO`, `Source`/count projections→`SourceDTO`,
  `Sunrei`/count projections→`SunreiSummaryDTO`, `GetPlace/GetSource/GetSunrei` results.
- B0-8. Public query helpers: `SourceService.listPublicSummaries(q?, bounds?, center?)` for source rail
  and picker; `SearchService.search(q, center?)` returning database place hits, source hits, and published
  Sunrei hits. Keep Google Places autocomplete on the client for external area/location results.

## B1 · Public routes (replace the A3 stubs)

- B1-1. `routes/app/MapRoutes.kt`: real two-mode `GET /api/map` (center anchor, published-gated;
  `sourceIds` present → source/global, else bounds → nearby, else 400; no tag filtering server-side).
- B1-2. `app/SourceRoutes.kt`: real `GET /api/sources` for source rail and add-source picker, plus
  `GET /api/sources/{id}` for source intro and managed work pages. Use optional `centerLat,centerLng`
  to sort videos by nearest spot. YouTube sources return enough data to link out; Anime, TV, and Other
  return managed-page data.
- B1-3. `app/{PlaceRoutes,SearchRoutes}.kt`: real `/api/places/{id}` and `GET /api/search?q=` →
  `SearchResult{ places[], sources[], sunreis[] }`. Use optional `centerLat,centerLng` for distances.
  Server place hits cover Sunrei Places; the client can merge Google Places autocomplete results into the
  Areas & places group.
- B1-4. `app/SunreiRoutes.kt` (`/api/sunreis/{id}` summary+spots), `app/TagRoutes.kt` (bilingual);
  confirm registration in `AppRoutes.kt`.

Checkpoint B1: `./gradlew compileKotlin`; then verify against Phase A data. `GET /api/map?swLat=…&
centerLat=…` returns one card per place, one `mentions[]` row per video, and `distanceMeters` sorted from
the center. `?sourceIds=a,b` is global with no viewport bound. The same `googleMapsId` collapses to one
Place; the same channel can produce two mention rows; one video with two spots at one place produces one
mention. Verify `/api/sources`, `/api/sources/{id}`, `/api/sunreis/{id}`, `/api/search?q=` (places,
sources, and sunreis), and `/api/tags`. Unpublished sunreis (`published_at IS NULL`) never surface.

## B-app · Public app (`packages/sunrei-app`)

Build the public app by screen flow, not only by component. The component tasks below are still the file
map, but each flow should be usable and screenshot-checked before the next flow depends on it.

Public screen-flow checkpoints:

- Opening flow: load the map page, ask for optional location, seed to user or Seoul, fetch nearby Places
  from browser viewport bounds, and show the first desktop sidebar or mobile sheet.
- Nearby discovery flow: pan or zoom the map, show "Search nearby", refetch from the visible bbox, keep
  card and marker selection in sync, and keep distance sorted from the map center.
- Place detail flow: tap a marker or PlaceCard, open the detail sheet or panel, show one mention row per
  video, expand spot rows, and return to the same list state.
- Video preview flow: tap a mention row, fetch the Sunrei, fit the map to that video's spots, show the
  preview banner, suppress nearby refetch, and exit back to the active base mode.
- Search flow: open search, show Areas & places, Channels & programs, and Videos; location results move
  the map, source results add chips, and video results open detail.
- Source mode flow: select one or more sources, fetch all Places for those sources globally, fit bounds to
  the union, keep chips removable, and return to nearby when the last chip is cleared.
- Tag filter flow: open tag rail or filter sheet, toggle bilingual tags, filter the list client-side, dim
  non-matching pins, and show the correct empty state.
- Source and content detail flow: open YouTube source intro, channel intro, managed work page, and video
  detail summary with tag-grouped spots; link labels come from Source type.
- Parity flow: repeat the flows above on desktop and mobile in EN and KO, including loading, empty, and
  error states.

### Ba · Setup & primitives

- Ba-1. Fix the `package.json` codegen path (`../../` → `../../../sunrei-api/`) and run `pnpm codegen`.
- Ba-2. Extend `globals.css` + `tailwind.config` with missing WF tokens (`accentSoft`, `accentInk`,
  `line`/`line2`, `ink2`/`ink3`). Keep Pantone + Pretendard.
- Ba-3. `src/components/wf/*`: Pin, Thumb, Avatar, Chip, SearchBar, Handle, SpotRow, ViewToggle,
  Btn variants ← `wireframe-kit.jsx`. No UserDot/CenterMark sort anchor.
- Ba-4. `place-card/PlaceCard.tsx`: `place.mentions[]`, 1 → compact / ≥2 → rich, header "In N
  videos", rows lead with video title then `channel · context`; rows tappable (→ video preview, Bd-3);
  active/pressed props ← `components-place-card.jsx`.
- Ba-5. `place-card/PlaceCard.skeleton.tsx` + expanded; `/dev` sandbox. Done when the states board,
  including "same channel, 2 videos", matches `screenshots/`.

### Bb · State & types

- Bb-1. `stores/map-store.ts`: `mode`, `selectedSourceIds[]`, `committedBounds`, `pendingArea`,
  `mapCenter` (sort/query anchor), `initialSeed` (optional GPS else Seoul), `zoom`, `mapInstance`;
  transitions include `clearSources()`→nearby and `commitSearchArea()`. No `userLatLng` anchor.
- Bb-2. `stores/ui-store.ts` (keep `isMobile`): `sheetSnap`, `detailTarget`, `activePlaceId`,
  `expandedPlaceId`, `searchOpen`, `filtersSheetOpen`, `videoPreview:{sunreiId, returnTo} | null` +
  `enterVideoPreview/exitVideoPreview`.
- Bb-3. `stores/filter-store.ts`: `activeTagIds[]`.
- Bb-4. `types/view-models.ts`: `SourceVM`, `MentionVM`, `SpotVM`, `PlaceVM`.
- Bb-5. `lib/query-keys.ts`: the map key encodes mode/sourceIds/center (not tags; tag filter
  is client-side post-query state, so it must not refetch the map).

### Bc · Shell, geolocation, map engine

- Bc-1. Rewrite `app/page.tsx` to a thin `<AppShell>`; `AppShell.tsx` picks mobile/desktop; hoist Maps
  `Wrapper` in `providers.tsx`.
- Bc-2. `onboarding/GeolocationGate.tsx`: optional/non-blocking; granted → seed `mapCenter` on
  user, denied → Seoul; desktop also requests; never gates discovery ← `screens-onboarding{,-desktop}.jsx`.
- Bc-3. `map/MapView.tsx`: GoogleMap wrapper, `idle` handler (bounds + center), `fitBounds` helper,
  desktop +/− zoom + "Filters" button.
- Bc-4. `map/MarkerLayer.tsx`: one OverlayView per Place, diffed (fix flicker), active/dim; no
  UserDot anchor (optional faint "you" dot only if GPS granted).
- Bc-5. Deep-link sync: params → stores on mount; write back via `history.replaceState`.

### Bd · Nearby loop, detail, video preview

- Bd-1. `hooks/useMapPlaces.ts`: builds bounds+center (nearby) / sourceIds+center (source) →
  `PlaceVM[]`. A separate selector applies the client-side tag filter over that result: the visible
  list = places whose `tags[]` match `activeTagIds`; `dimmedIds` = the non-matching places
  (pins dimmed, not removed). Empty `activeTagIds` → all shown.
- Bd-2. Desktop `desktop/{Sidebar,SourceRail,DetailPanel}.tsx` (SourceRail tap → source mode) ←
  `screens-home-desktop.jsx`; mobile `mobile/{PeekSheet,SheetHeader,PeekCarousel,ListView,MapBar}.tsx`
  (3 snaps, ~250ms, ViewToggle, map dims at list snap) ← `screens-sheet-motion.jsx`, `screens-home-mobile.jsx`.
- Bd-3. `map/SearchNearbyButton.tsx`: on `idle`, diff bounds vs `committedBounds`→`pendingArea`;
  "Search nearby" → "Finding spots…" → `commitSearchArea` refetch (nearby only); pending = list
  relabels "Showing previous area" + dims ← `screens-map-interaction{,-desktop}.jsx`. Card↔marker sync.
- Bd-4. `detail/PlaceDetail.tsx` + `MentionRow.tsx` (mobile sheet / desktop panel): rows per video
  mention; focus/dim; no bookmark/Directions ← `screens-marker.jsx`, `screens-detail-desktop.jsx`.
- Bd-5. `detail/ExpandSpots.tsx`: inline accordion (mobile) / side panel (desktop) ← `screens-expand.jsx`.
- Bd-6. `detail/VideoPreview.tsx` (new): tap a video row → `getSunreiWithSpots(id)`, swap list to
  that video's spots (SpotRows, ward-grouped), `fitBounds`, "Previewing video" banner + ✕, suppress
  Search-nearby; nests (✕ → source base if active, else nearby) ← `screens-video-preview.jsx` (3-step, both platforms).

### Be · Search & source mode

- Be-1. `search/UnifiedSearch.tsx`: one input; desktop dropdown / mobile full-screen ←
  `screens-search-cases{,-mobile}.jsx`.
- Be-2. Location autocomplete (Google Places) → `panTo` + set `mapCenter`, stays nearby.
- Be-3. `hooks/useSearch.ts`: `GET /api/search?q=` (debounced) → `{ places, sources, sunreis }`;
  merge Google Places autocomplete into the Areas & places group, the Channels & programs group filters
  by source, and the Videos group opens detail.
- Be-4. `search/SearchResultRow.tsx`: three groups (Areas → move map, Channels → filter, Videos →
  open) + action hints; applied source shows ✓ "tap to remove".
- Be-5. `search/SourceChips.tsx`: stacked removable chips + Undo toast; `AddSourcePicker.tsx` (no
  media-type grouping / no platform badge).
- Be-6. Source-mode machine: global, list = Places those sources feature (nearest to center),
  `fitBounds` to the union, suppress idle-refetch + button; clear → nearby ← `screens-scope-rule.jsx`,
  `screens-scope-mobile.jsx`.

### Bf · Tags

- Bf-1. `tags/TagChipRail.tsx`: bilingual chip rail; `useTagLabel()` picks ko/en ← `screens-tags.jsx`.
- Bf-2. `tags/FiltersSheet.tsx` (mobile) / `FiltersModal` (desktop): full bilingual tag grid
  (KO+EN), no media-type facet; Reset / "Show N places".
- Bf-3. Client-side filtering: toggling tags updates `filter-store.activeTagIds`; the Bd-1 selector
  filters the list to matches and returns `dimmedIds` so `MarkerLayer` dims non-matching pins (no
  map refetch).

### Bg · Source surfaces, content summary, i18n

- Bg-1. `detail/SourceIntro.tsx` + `LinkOutButton.tsx`: video still + title + intro + compact "Watch
  on YouTube ↗" ← `screens-source-intro.jsx`.
- Bg-2. `detail/ChannelIntro.tsx`: channel band + "videos near you".
- Bg-3. `detail/WorkInfoPage.tsx`: Anime/TV/Other managed page (poster, title EN/KO, synopsis, its
  spots, optional secondary "Where to watch ↗") ← `screens-source-route.jsx` (+ desktop).
- Bg-4. `detail/VideoDetail.tsx`: tag-grouped video summary. Show the `summary` intro, then spots grouped
  by tag (per-group "see on map ›") + optional in-video tag-chip filter; client-side over
  `GetSunreiResult.spots[].tags`; tag colors from a fixed brand palette (cornflower/willow/viola/
  taupe) by tag id, not media-type ← `screens-content-summary.jsx`. (Distinct from Bd-6 map-itinerary preview.)
- Bg-5. i18n: add `next-intl`; `messages/{en,ko}.json`; `NextIntlClientProvider`; cookie locale (no
  path routing); `useTagLabel()`; `Accept-Language`.

### Bh · States, parity, cleanup

- Bh-1. Loading skeletons + error states (share card footprint).
- Bh-2. Mode-aware empty states: nearby shows "Zoom out to nearest" + conditional "Clear filters"; source:
  "No places for this source yet" + "Clear source" ← `screens-mobile-states.jsx`.
- Bh-3. Desktop/mobile parity pass: mirror every screen both ways.
- Bh-4. Delete legacy components: `SunreiMap`, `SunreiSidebar`, `SunreiBottomBar/*`, `PlaceDetailDialog`,
  `SunreiDetailDialog`, `MarkerInfoWindow`, `Header`, `hooks/useMapSpots`.
- Bh-5. Verify with `pnpm dev:app` (:3000); Playwright MCP at mobile `390×844` + desktop `1440×900`,
  EN+KO, nearby/source/video-preview, tag filter, detail/expand, empty/loading; compare vs `screenshots/`.

Checkpoint B: `pnpm --filter sunrei-app codegen && pnpm --filter sunrei-app build`.

---

## Final Acceptance

- Backend compiles; migrations apply cleanly; OpenAPI DTOs regenerate.
- Phase A: admin app builds; the full create→publish flow works (source → Sunrei with per-spot context and
  bilingual tags → publish), and place dedupe + tag detach are verified.
- Phase B: public app builds; both locales (EN/KO) work; full desktop+mobile parity.
- Distance is always nearest to the map center; geolocation only seeds the opening center.
- One marker/card per Place; `mentions[]` renders one row per video ("In N videos"); same channel can
  repeat.
- Nearby ("Search nearby" → "Finding spots…"), source (global, fit-to-union), and video preview
  (mini source-mode, nests, no re-search) all behave per the Map state model.
- Tag filtering is client-side over the returned in-scope set: the list filters to matching places,
  non-matching pins dim, tags are bilingual, and the public UI has no media-type/platform facet or badge.
- Unpublished sunreis (`published_at IS NULL`) never surface publicly; admin can publish/unpublish.
- No legacy map DTOs, Sunrei-level tags, or public-route stubs remain.

---

## Implementation status & deviations

Status: **implemented.** All of Phase A and Phase B is built, builds green
(`./gradlew compileKotlin`, `pnpm --filter sunrei-app build`, `pnpm --filter sunrei-admin build`),
and was verified end-to-end in-browser (desktop + mobile, EN + KO) against ingested data. An
independent audit confirmed the Final Acceptance checklist passes — including parameterized PostGIS
(no WKT interpolation), published-gating on every public read path, race-safe Place dedupe by
`google_maps_id`, mention collapse/ordering/tag-union, real per-Place `OverlayView` markers, the full
nearby/source/video-preview state machine, client-side tag filtering (list filters to matches, pins
dim), bilingual filters, i18n, and no leftover stubs/legacy DTOs.

The following are intentional deviations from the literal text above, made during implementation:

1. **Bg-1/2/3 — source surfaces consolidated.** `SourceIntro`, `ChannelIntro`, and `WorkInfoPage` are
   one type-branching `detail/SourceDetail` component (YouTube → intro + watch-out; Anime/TV/Other →
   managed work page). Same behavior, fewer files.
2. **Bg-4 — in-video tag-chip filter omitted.** `VideoDetail` shows the summary + tag-grouped spots
   with the brand palette; the *optional* in-video tag-chip toggle was not built.
3. **Bd-2 — mobile sheet.** Implemented as a 3-snap peek sheet (peek/half/full, tap-driven, map dims
   at full); no separate `PeekCarousel`.
4. **B0-5 — mention ordering.** Mentions order by source then sunrei recency. "Nearest spot" is
   constant within a Place (all its mentions share the Place's coordinates), so it cannot order there.
5. **`GET /api/sunreis/{id}` center anchor.** The server honors optional `centerLat,centerLng` (spots
   returned nearest-first with `distanceMeters`); the client does not yet pass center, since no current
   surface displays per-spot distance.
6. **Search `spotCount`.** `SunreiSummaryDTO.spotCount` is `0` for video search hits (not yet projected).
7. **File layout.** The public app matches the prescribed structure (`components/wf/*`,
   `components/desktop/*`, `components/mobile/*`, `types/view-models.ts`, `/dev` sandbox).

### Configuration

- **Google Maps API key** must have **Maps JavaScript API**, **Places API**, and **Geocoding API**
  enabled (Places + Geocoding power search autocomplete and result selection).
- `sunrei-frontend/packages/sunrei-app/.env.local` — `NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` (gitignored).
- `sunrei-server/src/main/resources/application-local.conf` — DB connection plus Google OAuth under
  `auth.oauth.google.{clientId,clientSecret}` (gitignored).
