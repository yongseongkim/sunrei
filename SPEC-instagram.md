# Instagram 수집 스펙

상태: Phase 1~3 구현 완료, 브랜치 `feat/instagram-collection`.
- Phase 1: 임시 PostGIS DB에서 V1→V2→V3 적용, 1.7 체크포인트 46개 항목, 동시 승인 테스트를 통과했다.
- Phase 2: 두 앱의 타입을 다시 생성했고 둘 다 빌드가 통과한다.
- Phase 3: 단위 테스트 18개가 통과한다. 로컬 DB에 choiza11 워크스페이스 2,004개를 가져왔고, 후보를 승인해 공개 앱에서
  Instagram 링크로 보이는 것, 프로필 사진이 채널 아바타로 보이는 것, 수집기가 게시물 두 개를 끝까지 처리하는 것을
  확인했다.
- 운영 배포와 운영 데이터 가져오기는 아직 하지 않았다.

## 요약

등록한 Instagram 계정에서 장소를 수집한다. YouTube 플레이리스트를 수집하는 방식과 같다. 첫 계정은
`choiza11`(최자, 다이나믹 듀오)이다. 장소마다 그 장소를 소개한 Instagram 게시물로 연결되는
SunreiSpot을 만든다.

YouTube 수집(`V2__youtube_collection.sql`, `YoutubeService`, `/admin/youtube/*`)을 본뜬다.
Instagram은 YouTube와 같은 모양의 별도 테이블과 admin API를 갖고, YouTube 쪽은 건드리지 않는다.

데이터를 가져오는 일은 모두 로컬 스킬(`instagram-to-sunrei`)이 한다. Graph API 호출, 게시물 페이지 읽기, 릴스
다운로드, Whisper·OCR, 추출, 지오코딩이 로컬에서 돌고, 결과만 admin API로 서버에 저장한다. 서버는 Instagram을
호출하지 않으며 주기 작업도 없다. 그래서 Instagram 키는 로컬 스크립트만 읽는다.

Instagram 테이블 밖의 변경 세 가지:

1. `sunrei_spot.youtube_link`를 `source_link`로, API 필드 `youtubeLink`를 `sourceLink`로 바꾼다.
   이제 spot이 Instagram 게시물로도 연결되기 때문이다.
2. Source 타입에 `INSTAGRAM`을 추가한다. 공개 앱에서는 `YOUTUBE`처럼 동작해서 Source가 프로필로
   바로 연결된다.
3. 수집기를 `.claude/scripts/instagram/`의 스크립트와 `.agents/skills/instagram-*` 스킬로 만들어
   프로토타입을 대체한다.

### 이미 정한 것

프로토타입 중에 사용자가 정한 것으로, 여기서 다시 논의하지 않는다.

- 수집 모델을 일반화하지 않고 Instagram 전용 테이블과 `/admin/instagram/*` API를 둔다.
- Instagram 계정 하나에 Sunrei 하나를 둔다. YouTube는 플레이리스트 하나에 Sunrei 하나다.
- `#최자맛집` 같은 계정별 키워드 규칙을 두지 않는다. 다른 계정도 추가할 것이므로 agent가 게시물
  내용을 보고 판단한다.
- 광고는 후보를 만들지 않고 근거만 추출 기록에 남긴다. 광고 표시가 있는 글(광고, 협찬, 유료 광고)과,
  2026-10-15부터는 작성자 본인의 사업·브랜드·행사·공연을 알리는 게 주목적인 글(`SELF_PROMOTION`)이
  해당한다. 리뷰 글 끝에 자기 채널을 홍보하는 정도로는 자체 홍보가 아니다.
- 계정의 게시물은 과거 전체를 포함해 모두 저장하고 처리한다. 증분 수집은 저장된 가장 최신
  게시물에서 멈춘다. `SKIPPED`는 새 글만 모으도록 등록한 계정에만 쓴다.
- spot 제목은 당분간 게시물 캡션 첫 줄로 한다. 다른 계정을 살펴본 뒤 다시 정한다.
- 게시물 목록은 Graph API의 Business Discovery(공식 API, 과거 전체)로 받는다. 위치 태그는 로그인하지
  않은 게시물 페이지에서 읽는다. 릴스는 로그인 없이 yt-dlp로 받고, 연령 제한 릴스는 API의
  `media_url`로 받는다. 로그인 쿠키는 쓰지 않는다.
- 릴스는 Whisper로 받아쓰고 화면 전체를 OCR로 읽어 캡션과 함께 추출에 넣는다. 설명에는 작성자가
  말로 한 평가를 녹인다.
- 어느 자료에도 상호가 없는 장소는 상호 미확인으로 저장하고 Google Places에 보내지 않는다.
- 액세스 토큰은 SOPS(`deploy/secrets/secrets.enc.yaml`의 `instagram-access-token`)에 둔다. 실행에
  토큰이 필요할 때 사용자가 `refresh_token.py`(브라우저 로그인)로 갱신한다.

### 현재 상태

- Graph API 접근이 된다. 앱 `sunrei`(2664113057374533), IG 사용자 `17841471572701752`. 토큰은
  2026-12-13까지 유효하다.
- choiza11 워크스페이스 데이터(`.claude/workspace/instagram/choiza11/`, gitignore):
  - 게시물 2,004개 전체
  - 위치 태그: 1,997개를 읽었고 1,120개에 태그가 있다
  - 전체 게시물의 추출과 지오코딩: 후보 813개
  - Whisper와 OCR을 마친 릴스 416개
- 프로토타입(`ig_create_sunrei.py`)이 prod에 draft Sunrei를 만들었을 수 있다. "최자 Choiza of
  dynamicduo"라는 `OTHER` 타입 Source 아래다. Phase 3에서 새로 만들지 않고 이것을 전환한다.

### 규칙

- YouTube 수집의 이름과 모양을 따른다.
  - `Upsert…Request`, `{data, totalSize, totalElements, nextToken}` 형태의 `List…Result`
  - `{"error": "..."}` 형태의 오류, `handleErrors`의 매핑(없으면 404, 충돌이면 409, 그 밖에는 400)
  - `PaginationToken`의 offset 페이지 토큰
- Exposed DSL만 쓰고, 문자열을 이어 붙여 SQL을 만들지 않는다.
- ID: 외부 ID(Instagram 사용자 ID, 미디어 ID)는 그대로 기본 키로 쓴다. 생성 ID는 `ULIDTable`에 새
  접두사 `IT`, `IR`, `IP`, `IA`를 쓴다. 모두 아직 쓰지 않는 접두사다(기존: OAUTH, P, SR, SRC, SS, T,
  U, YA, YP, YR, YT).
- 작업이 끝날 때마다 `AGENTS.md`(도메인 섹션)와 이 스펙을 맞춘다.
- 작업은 의존 순서로 나열한다. 작업마다 파일과 완료 조건이 있고, 체크포인트는 반드시 통과해야
  다음으로 넘어간다.

---

# PHASE 1 · 스키마와 admin API (서버)

목표: 서버가 계정, 게시물, 텍스트, 추출 기록, 후보를 저장하고, admin이 API로 후보를 검토해
SunreiSpot으로 만들 수 있다. 로컬 DB에서 컴파일되고 동작한다.

## 1.1 · 마이그레이션 `V3__instagram_collection.sql`

파일: `sunrei-server/src/main/resources/db/migration/V3__instagram_collection.sql`

```sql
-- Instagram collection: registered accounts, their posts, collected texts,
-- extraction runs, and extracted places waiting for admin review.
-- An extracted place becomes a SunreiSpot only when an admin approves it.
-- Also generalizes the spot link and adds the INSTAGRAM source type.

-- A spot links to the content that mentions the place: a YouTube timestamp or an Instagram post.
-- Expand step: the PreSync migration runs while the old server still serves and reads youtube_link,
-- so add and copy here; V4 (next release) copies late writes and drops youtube_link.
ALTER TABLE sunrei_spot ADD COLUMN source_link VARCHAR(255);
UPDATE sunrei_spot SET source_link = youtube_link WHERE youtube_link IS NOT NULL;

-- Postgres names an inline column CHECK "<table>_<column>_check".
ALTER TABLE source DROP CONSTRAINT source_type_check;
ALTER TABLE source ADD CONSTRAINT source_type_check
  CHECK (type IN ('YOUTUBE','INSTAGRAM','TV','ANIME','OTHER'));

-- A registered Instagram professional account. The collection runs locally as a skill (renew_accounts.py);
-- sync_enabled selects the accounts a run without --account processes.
CREATE TABLE instagram_account (
  id VARCHAR(32) PRIMARY KEY,                   -- Instagram user ID from Business Discovery
  username VARCHAR(64) NOT NULL,                -- handle without @; can change
  name VARCHAR(255),
  biography TEXT,
  followers_count INTEGER,
  media_count INTEGER,
  sunrei_id VARCHAR(32) REFERENCES sunrei(id),  -- approved places are added here
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  backfill_cursor TEXT,                         -- Business Discovery "after" cursor of an unfinished backfill
  backfill_completed_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX idx_instagram_account_username ON instagram_account (lower(username));

-- A post and its processing status. title is derived from the caption on every upsert.
CREATE TABLE instagram_post (
  id VARCHAR(32) PRIMARY KEY,                   -- Instagram media ID
  account_id VARCHAR(32) NOT NULL REFERENCES instagram_account(id) ON DELETE CASCADE,
  shortcode VARCHAR(32) NOT NULL,               -- from the permalink; the API has no shortcode field
  permalink VARCHAR(255) NOT NULL,
  media_type VARCHAR(16) NOT NULL CHECK (media_type IN ('IMAGE','VIDEO','CAROUSEL_ALBUM')),
  product_type VARCHAR(16),                     -- FEED or REELS as reported by the API
  caption TEXT,
  title VARCHAR(128) NOT NULL,                  -- first caption line without hashtags, or the shortcode
  posted_at TIMESTAMPTZ NOT NULL,
  like_count INTEGER,
  comments_count INTEGER,
  location_tag JSONB,                           -- {pk, name, lat, lng}; NULL when absent or not read
  location_tag_read_at TIMESTAMPTZ,             -- NULL = the post page has not been read
  promotion VARCHAR(16) CHECK (promotion IN ('NONE','DISCLOSED_AD','SELF_PROMOTION')),  -- from the latest run
  promotion_evidence TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','REVIEW_PENDING','COMPLETED','FAILED','SKIPPED')),
  stage VARCHAR(64),                            -- current or failed pipeline step
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX idx_instagram_post_shortcode ON instagram_post(shortcode);
CREATE INDEX idx_instagram_post_account_id_posted_at ON instagram_post(account_id, posted_at DESC);
CREATE INDEX idx_instagram_post_status ON instagram_post(status);

-- Text derived from a reel, kept for debugging and re-extraction.
-- Rows are appended; the newest row of a kind is the current one.
CREATE TABLE instagram_post_text (
  id VARCHAR(32) PRIMARY KEY,
  post_id VARCHAR(32) NOT NULL REFERENCES instagram_post(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('WHISPER','OCR')),
  language VARCHAR(16),
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{start, end, text, confidence}]
  full_text TEXT,
  params JSONB,                                 -- tool settings, e.g. Whisper model or OCR interval
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_instagram_post_text_post_id_kind ON instagram_post_text(post_id, kind, created_at);

-- One agent extraction for one post. Posts extracted in one agent call share batch_id.
CREATE TABLE instagram_extraction_run (
  id VARCHAR(32) PRIMARY KEY,
  post_id VARCHAR(32) NOT NULL REFERENCES instagram_post(id) ON DELETE CASCADE,
  batch_id VARCHAR(32),
  agent VARCHAR(32) NOT NULL,                   -- codex, claude, or skill
  model VARCHAR(64),
  prompt_sha256 VARCHAR(64),
  input_text_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
  promotion VARCHAR(16) CHECK (promotion IN ('NONE','DISCLOSED_AD','SELF_PROMOTION')),
  promotion_evidence TEXT,
  raw_output JSONB,                             -- this post's unmodified item from the agent output
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_instagram_extraction_run_post_id ON instagram_extraction_run(post_id, created_at);

-- A place candidate from an extraction run, reviewed in the admin.
CREATE TABLE instagram_extracted_place (
  id VARCHAR(32) PRIMARY KEY,
  run_id VARCHAR(32) NOT NULL REFERENCES instagram_extraction_run(id) ON DELETE CASCADE,
  post_id VARCHAR(32) NOT NULL REFERENCES instagram_post(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,                   -- business name, or a description when name_found is false
  name_found BOOLEAN NOT NULL DEFAULT TRUE,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  category VARCHAR(64),
  area VARCHAR(255),
  description TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{source, quote, startSeconds}]
  confidence VARCHAR(8) CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  needs_verification BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  -- Geocoding suggested by the job; the reviewer may correct it before approval.
  geocode_status VARCHAR(16) NOT NULL DEFAULT 'NOT_SEARCHED'
    CHECK (geocode_status IN ('MATCHED','NAME_MISMATCH','NOT_FOUND','NOT_SEARCHED')),
  place_name VARCHAR(128),
  address VARCHAR(255),
  latitude REAL,
  longitude REAL,
  google_maps_id VARCHAR(255),
  geocode_warning TEXT,
  review_status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (review_status IN ('PENDING','APPROVED','REJECTED','SUPERSEDED')),
  reviewed_at TIMESTAMPTZ,
  sunrei_spot_id VARCHAR(32) REFERENCES sunrei_spot(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_instagram_extracted_place_post_id ON instagram_extracted_place(post_id);
CREATE INDEX idx_instagram_extracted_place_review_status ON instagram_extracted_place(review_status);
CREATE INDEX idx_instagram_extracted_place_google_maps_id ON instagram_extracted_place(google_maps_id);

-- External call failures (Graph API limits, login walls, download errors, agent limits).
CREATE TABLE instagram_post_attempt (
  id VARCHAR(32) PRIMARY KEY,
  post_id VARCHAR(32) NOT NULL REFERENCES instagram_post(id) ON DELETE CASCADE,
  stage VARCHAR(64) NOT NULL,
  error TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_instagram_post_attempt_post_id ON instagram_post_attempt(post_id, created_at);
```

참고:

- YouTube와 일부러 다르게 한 것:
  - 게시물은 계정 하나에만 속하므로 소속 테이블이 없다. Instagram에서 지운 게시물은 감지하지
    않는다. Business Discovery는 남아 있는 미디어만 돌려주고, 빈 곳을 찾으려고 전체를 다시 받으면
    시간당 한도를 다 쓰기 때문이다. 지운 게시물의 데이터와 spot은 그대로 둔다.
  - 캡션은 목록과 함께 오고 거의 바뀌지 않으므로 텍스트 행이 아니라 게시물에 둔다.
  - 홍보 분류는 게시물 단위라서 추출 기록에 두고 게시물에 복사한다.
  - 확인이 필요한 후보를 찾으려고 `geocode_warning`을 해석하는 대신 `geocode_status`를 둔다.
  - 게시물을 다시 추출하면 이전 기록의 대기 중 후보를 `SUPERSEDED`로 표시한다. 재추출로 검토 목록이
    두 배가 되지 않게 하려는 것이다. 이번 세션에서도 200개를 다시 돌렸다.
- `name_found = false`이면 `geocode_status = 'NOT_SEARCHED'`이다. 서비스에서 보장한다.
- "마지막으로 본 게시물" 표시만 두지 않고 모든 게시물을 저장하는 이유:
  - 게시물마다 처리 상태가 있다. 중단되거나 실패한 실행은 최신 게시물 뒤쪽에 빈틈을 남기는데,
    표시 하나로는 그 빈틈을 건너뛴다.
  - 추출 기록, 텍스트, 후보가 게시물 행을 참조하고, 검토할 때 게시물 제목과 링크가 필요하다.
  - 더 나은 프롬프트로 다시 추출할 때 목록을 다시 받지 않고 저장된 캡션을 쓴다.
  - 양이 적다. choiza11의 2,004개 캡션이 몇 MB다.
  - 증분 수집은 그대로 게시물이 모두 저장된 첫 페이지에서 멈춘다.
- `timestamp_seconds`는 없다. 게시물 링크에는 시간 위치가 없다. 근거의 `startSeconds`는 음성과 OCR
  인용에만 값이 있고, 캡션과 위치 태그는 0이다.

완료 조건:
- 새 DB와 V2까지 적용된 DB 모두에 Flyway가 V3를 적용한다.
- `\d sunrei_spot`에 `youtube_link`와 `source_link`가 함께 있고, 기존 행의 두 값이 같다.
- `\d source`에 `INSTAGRAM`이 들어간 새 check가 있다. 타입이 `INSTAGRAM`인 source는 들어가고 `FOO`는
  실패한다.

### V4 (다음 릴리스)

파일: `V4__drop_spot_youtube_link.sql`. V3 릴리스가 완전히 배포된 뒤에만 내보낸다.

```sql
-- Contract step of the spot link rename. Copy anything the old server wrote during the V3 rollout.
UPDATE sunrei_spot SET source_link = youtube_link
  WHERE source_link IS NULL AND youtube_link IS NOT NULL;
ALTER TABLE sunrei_spot DROP COLUMN youtube_link;
```

## 1.2 · Exposed 테이블과 spot 컬럼 이름 변경

파일:
- `sunrei-server/src/main/kotlin/com/sunrei/database/InstagramTables.kt` (새 파일)
- `sunrei-server/src/main/kotlin/com/sunrei/database/SunreiSpotTable.kt`

`SunreiSpotTable.kt`의 `val youtubeLink = varchar("youtube_link", 255).nullable()`를
`val sourceLink = varchar("source_link", 255).nullable()`로 바꾼다.

`InstagramTables.kt`는 `YoutubeTables.kt`를 따른다:

```kotlin
object InstagramAccounts : Table("instagram_account") {
    val id = varchar("id", 32)
    val username = varchar("username", 64)
    val name = varchar("name", 255).nullable()
    val biography = text("biography").nullable()
    val followersCount = integer("followers_count").nullable()
    val mediaCount = integer("media_count").nullable()
    val sunreiId = varchar("sunrei_id", 32).references(Sunreis.id).nullable()
    val syncEnabled = bool("sync_enabled").default(true)
    val backfillCursor = text("backfill_cursor").nullable()
    val backfillCompletedAt = timestamp("backfill_completed_at").nullable()
    val lastSyncedAt = timestamp("last_synced_at").nullable()
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
    override val primaryKey = PrimaryKey(id)
}

object InstagramPosts : Table("instagram_post") {
    val id = varchar("id", 32)
    val accountId = varchar("account_id", 32).references(InstagramAccounts.id)
    val shortcode = varchar("shortcode", 32)
    val permalink = varchar("permalink", 255)
    val mediaType = varchar("media_type", 16)
    val productType = varchar("product_type", 16).nullable()
    val caption = text("caption").nullable()
    val title = varchar("title", 128)
    val postedAt = timestamp("posted_at")
    val likeCount = integer("like_count").nullable()
    val commentsCount = integer("comments_count").nullable()
    val locationTag = jsonb<JsonElement>("location_tag", Json.Default).nullable()
    val locationTagReadAt = timestamp("location_tag_read_at").nullable()
    val promotion = varchar("promotion", 16).nullable()
    val promotionEvidence = text("promotion_evidence").nullable()
    val status = varchar("status", 16)
    val stage = varchar("stage", 64).nullable()
    val error = text("error").nullable()
    val processedAt = timestamp("processed_at").nullable()
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
    override val primaryKey = PrimaryKey(id)
}

object InstagramPostTexts : ULIDTable("instagram_post_text", "IT") {
    val postId = varchar("post_id", 32).references(InstagramPosts.id)
    val kind = varchar("kind", 16)
    val language = varchar("language", 16).nullable()
    val segments = jsonb<JsonElement>("segments", Json.Default)
    val fullText = text("full_text").nullable()
    val params = jsonb<JsonElement>("params", Json.Default).nullable()
    val createdAt = timestamp("created_at")
}

object InstagramExtractionRuns : ULIDTable("instagram_extraction_run", "IR") {
    val postId = varchar("post_id", 32).references(InstagramPosts.id)
    val batchId = varchar("batch_id", 32).nullable()
    val agent = varchar("agent", 32)
    val model = varchar("model", 64).nullable()
    val promptSha256 = varchar("prompt_sha256", 64).nullable()
    val inputTextIds = jsonb<List<String>>("input_text_ids", Json.Default)
    val status = varchar("status", 16)
    val promotion = varchar("promotion", 16).nullable()
    val promotionEvidence = text("promotion_evidence").nullable()
    val rawOutput = jsonb<JsonElement>("raw_output", Json.Default).nullable()
    val error = text("error").nullable()
    val startedAt = timestamp("started_at").nullable()
    val finishedAt = timestamp("finished_at").nullable()
    val createdAt = timestamp("created_at")
}

object InstagramExtractedPlaces : ULIDTable("instagram_extracted_place", "IP") {
    val runId = varchar("run_id", 32).references(InstagramExtractionRuns.id)
    val postId = varchar("post_id", 32).references(InstagramPosts.id)
    val name = varchar("name", 255)
    val nameFound = bool("name_found").default(true)
    val aliases = jsonb<List<String>>("aliases", Json.Default)
    val category = varchar("category", 64).nullable()
    val area = varchar("area", 255).nullable()
    val description = text("description").nullable()
    val evidence = jsonb<JsonElement>("evidence", Json.Default)
    val confidence = varchar("confidence", 8).nullable()
    val needsVerification = bool("needs_verification").default(false)
    val reason = text("reason").nullable()
    val geocodeStatus = varchar("geocode_status", 16)
    val placeName = varchar("place_name", 128).nullable()
    val address = varchar("address", 255).nullable()
    val latitude = float("latitude").nullable()
    val longitude = float("longitude").nullable()
    val googleMapsId = varchar("google_maps_id", 255).nullable()
    val geocodeWarning = text("geocode_warning").nullable()
    val reviewStatus = varchar("review_status", 16)
    val reviewedAt = timestamp("reviewed_at").nullable()
    val sunreiSpotId = varchar("sunrei_spot_id", 32).references(SunreiSpots.id).nullable()
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object InstagramPostAttempts : ULIDTable("instagram_post_attempt", "IA") {
    val postId = varchar("post_id", 32).references(InstagramPosts.id)
    val stage = varchar("stage", 64)
    val error = text("error")
    val createdAt = timestamp("created_at")
}
```

완료 조건: 1.3과 1.4를 마친 뒤 `./gradlew compileKotlin`이 통과한다. 그 전까지는 이름 변경 때문에
호출하는 쪽이 깨진다.

## 1.3 · 서버와 API 스펙의 `source_link` 이름 변경

서버를 거치는 모든 곳에서 필드 이름을 바꾼다. 동작은 바뀌지 않는다.

| 파일 | 변경 |
|---|---|
| `sunrei-api/admin-api-spec.yaml` | `SunreiSpotDTO.youtubeLink`, `CreateSunreiSpotInline.youtubeLink`, `UpdateSunreiSpotInline.youtubeLink` → `sourceLink` (약 1037, 1121, 1146행) |
| `sunrei-api/app-api-spec.yaml` | `SunreiSpotDTO.youtubeLink`(약 313행)와 mention DTO의 `youtubeLink`(약 360행) → `sourceLink`. 설명은 "sunrei_spot.source_link deep link (YouTube timestamp or Instagram post)" |
| `model/SunreiSpot.kt`, `service/PlaceFeedModels.kt` | 속성 `youtubeLink` → `sourceLink` |
| `service/SunreiService.kt` (225, 231, 240, 255, 272, 394행) | 파라미터와 컬럼 참조 |
| `service/SunreiSpotService.kt` (76, 105, 139, 200행) | 같음 |
| `service/SearchService.kt` (106–115행) | `SunreiSpots.sourceLink`를 조회한다. `youtubeThumbnail()`은 YouTube가 아닌 링크에 이미 null을 돌려주므로 Instagram spot은 썸네일이 없다 |
| `routes/app/converter/PlaceFeedConverter.kt:15`, `routes/app/converter/SunreiConverter.kt:55`, `routes/admin/converter/SunreiConverter.kt:65` | DTO 필드 |
| `service/YoutubeService.kt:430` | `youtubeLink =` → `sourceLink =` |

서버의 `INSTAGRAM`:

| 파일 | 변경 |
|---|---|
| `sunrei-api/admin-api-spec.yaml:860`, `sunrei-api/app-api-spec.yaml:228` | `SourceType` enum에 `INSTAGRAM` 추가 |
| `model/Source.kt:5-10` | `enum class SourceType`에 `INSTAGRAM` 추가. 없으면 INSTAGRAM 행에서 `valueOf`가 예외를 던진다 |
| `database/SourceTable.kt:10` | `.check { it inList(listOf(...)) }`에 `"INSTAGRAM"` 추가. 시드 데이터로 `SchemaUtils.create`할 때만 쓰인다 |

서버 코드는 타입에 따라 분기하지 않는다. 나머지 사용처는 모두 `valueOf(name)`이라서(`SearchService`,
`SourceService`, `SunreiSpotService`, `SunreiConverter` 두 곳) 바꿀 필요가 없다.

완료 조건: `rg -n 'youtubeLink|youtube_link' sunrei-server/src sunrei-api` 결과가 없고,
`./gradlew compileKotlin`이 통과한다(`generateProtocols`를 함께 돈다).

## 1.4 · Admin API 계약 `/admin/instagram/*`

파일: `sunrei-api/admin-api-spec.yaml`. YouTube 블록 뒤에 `# ===== Instagram collection =====` 블록을
새로 둔다. 모든 operation은 `security: [{ bearerAuth: [] }]`이고, 토큰이 없으면 401이다.

### 경로

| 메서드와 경로 | operationId | 요청 | 응답 | 오류 |
|---|---|---|---|---|
| `GET /admin/instagram/accounts` | `listInstagramAccounts` | | `ListInstagramAccountsResult` | |
| `GET /admin/instagram/accounts/{id}` | `getInstagramAccount` | | `InstagramAccountDTO` | 404 |
| `PUT /admin/instagram/accounts/{id}` | `upsertInstagramAccount` | `UpsertInstagramAccountRequest` | `InstagramAccountDTO` | 400, 409 username 중복 |
| `PUT /admin/instagram/accounts/{id}/posts` | `upsertInstagramPosts` | `UpsertInstagramPostsRequest` | `UpsertInstagramPostsResult` | 400, 404 |
| `GET /admin/instagram/posts` | `listInstagramPosts` | 쿼리: `accountId`, `status`, `mediaType`, `locationTagRead`(bool), `nextToken`, `size`(1–100, 기본 20) | `ListInstagramPostsResult`, 최신순 | |
| `GET /admin/instagram/posts/{id}` | `getInstagramPost` | | `InstagramPostDetailDTO` | 404 |
| `PATCH /admin/instagram/posts/{id}` | `updateInstagramPost` | `UpdateInstagramPostRequest` | `InstagramPostDTO` | 404 |
| `PUT /admin/instagram/posts/{id}/location-tag` | `setInstagramPostLocationTag` | `SetInstagramLocationTagRequest` | `InstagramPostDTO` | 404 |
| `POST /admin/instagram/posts/{id}/texts` | `createInstagramPostText` | `CreateInstagramPostTextRequest` | 201 `InstagramPostTextDTO` | 400, 404 |
| `GET /admin/instagram/texts/{id}` | `getInstagramPostText` | | segments를 포함한 `InstagramPostTextDTO` | 404 |
| `POST /admin/instagram/posts/{id}/extraction-runs` | `createInstagramExtractionRun` | `CreateInstagramExtractionRunRequest` | 201 `InstagramExtractionRunDTO` | 400, 404 |
| `GET /admin/instagram/extracted-places` | `listInstagramExtractedPlaces` | 쿼리: `reviewStatus`, `geocodeStatus`, `accountId`, `postId`, `nextToken`, `size` | `ListInstagramExtractedPlacesResult`, 오래된 순 | |
| `PATCH /admin/instagram/extracted-places/{id}` | `reviewInstagramExtractedPlace` | `ReviewInstagramExtractedPlaceRequest` | `InstagramExtractedPlaceDTO` | 400, 404, 409 이미 승인됨 또는 Sunrei 없음 |

### 스키마

OpenAPI 파일에 그대로 들어갈 내용이라 설명도 영어로 둔다.

```yaml
    InstagramPostStatus:
      type: string
      enum: [PENDING, PROCESSING, REVIEW_PENDING, COMPLETED, FAILED, SKIPPED]
    InstagramMediaType:
      type: string
      enum: [IMAGE, VIDEO, CAROUSEL_ALBUM]
    InstagramPromotion:
      type: string
      enum: [NONE, DISCLOSED_AD, SELF_PROMOTION]
    InstagramTextKind:
      type: string
      enum: [WHISPER, OCR]
    InstagramExtractionRunStatus:
      type: string
      enum: [SUCCEEDED, FAILED]
    InstagramConfidence:
      type: string
      enum: [HIGH, MEDIUM, LOW]
    InstagramGeocodeStatus:
      type: string
      enum: [MATCHED, NAME_MISMATCH, NOT_FOUND, NOT_SEARCHED]
    InstagramReviewStatus:
      type: string
      enum: [PENDING, APPROVED, REJECTED, SUPERSEDED]

    InstagramAccountDTO:
      type: object
      required: [id, username, syncEnabled, postCount, pendingPostCount, createdAt, updatedAt]
      properties:
        id: { type: string, description: Instagram user ID }
        username: { type: string }
        name: { type: string, nullable: true }
        biography: { type: string, nullable: true }
        followersCount: { type: integer, nullable: true }
        mediaCount: { type: integer, nullable: true, description: Media count reported by Instagram }
        sunreiId: { type: string, nullable: true, description: Approved places are added to this Sunrei }
        syncEnabled: { type: boolean }
        backfillCursor: { type: string, nullable: true }
        backfillCompletedAt: { type: string, format: date-time, nullable: true }
        lastSyncedAt: { type: string, format: date-time, nullable: true }
        postCount: { type: integer, description: Posts stored for the account }
        pendingPostCount: { type: integer, description: Posts with status PENDING or FAILED }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }

    ListInstagramAccountsResult:
      type: object
      required: [data]
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/InstagramAccountDTO' } }

    UpsertInstagramAccountRequest:
      type: object
      required: [username]
      properties:
        username: { type: string, maxLength: 64 }
        name: { type: string, nullable: true }
        biography: { type: string, nullable: true }
        followersCount: { type: integer, nullable: true }
        mediaCount: { type: integer, nullable: true }
        sunreiId: { type: string, nullable: true }
        syncEnabled: { type: boolean, nullable: true, description: Defaults to true for a new account }
        backfillCursor: { type: string, nullable: true, description: Saves backfill progress; null leaves it unchanged }
        backfillCompleted: { type: boolean, nullable: true, description: true clears the cursor and sets backfillCompletedAt }

    InstagramLocationTagDTO:
      type: object
      required: [name]
      properties:
        pk: { type: string, nullable: true }
        name: { type: string }
        latitude: { type: number, format: double, nullable: true }
        longitude: { type: number, format: double, nullable: true }

    InstagramPostInput:
      type: object
      required: [id, permalink, mediaType, postedAt]
      properties:
        id: { type: string, description: Instagram media ID }
        permalink: { type: string, maxLength: 255 }
        mediaType: { $ref: '#/components/schemas/InstagramMediaType' }
        productType: { type: string, nullable: true }
        caption: { type: string, nullable: true }
        postedAt: { type: string, format: date-time }
        likeCount: { type: integer, nullable: true }
        commentsCount: { type: integer, nullable: true }

    UpsertInstagramPostsRequest:
      type: object
      required: [posts]
      properties:
        posts: { type: array, maxItems: 100, items: { $ref: '#/components/schemas/InstagramPostInput' } }
        initialStatus:
          allOf: [{ $ref: '#/components/schemas/InstagramPostStatus' }]
          nullable: true
          description: Status for new posts (default PENDING); SKIPPED registers a baseline without processing.

    UpsertInstagramPostsResult:
      type: object
      required: [addedPostIds, updatedPostIds]
      properties:
        addedPostIds: { type: array, items: { type: string } }
        updatedPostIds: { type: array, items: { type: string } }

    InstagramPostDTO:
      type: object
      required: [id, accountId, shortcode, permalink, mediaType, title, postedAt, status, createdAt, updatedAt]
      properties:
        id: { type: string }
        accountId: { type: string }
        shortcode: { type: string }
        permalink: { type: string }
        mediaType: { $ref: '#/components/schemas/InstagramMediaType' }
        productType: { type: string, nullable: true }
        caption: { type: string, nullable: true }
        title: { type: string }
        postedAt: { type: string, format: date-time }
        likeCount: { type: integer, nullable: true }
        commentsCount: { type: integer, nullable: true }
        locationTag:
          allOf: [{ $ref: '#/components/schemas/InstagramLocationTagDTO' }]
          nullable: true
        locationTagReadAt: { type: string, format: date-time, nullable: true }
        promotion:
          allOf: [{ $ref: '#/components/schemas/InstagramPromotion' }]
          nullable: true
        promotionEvidence: { type: string, nullable: true }
        status: { $ref: '#/components/schemas/InstagramPostStatus' }
        stage: { type: string, nullable: true }
        error: { type: string, nullable: true }
        processedAt: { type: string, format: date-time, nullable: true }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }

    ListInstagramPostsResult:
      type: object
      required: [data, totalSize, totalElements]
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/InstagramPostDTO' } }
        totalSize: { type: integer }
        totalElements: { type: integer }
        nextToken: { type: string, nullable: true }

    UpdateInstagramPostRequest:
      type: object
      properties:
        status:
          allOf: [{ $ref: '#/components/schemas/InstagramPostStatus' }]
          nullable: true
        stage: { type: string, nullable: true }
        error: { type: string, nullable: true, description: Also recorded as an attempt; an empty string clears the error }

    SetInstagramLocationTagRequest:
      type: object
      properties:
        # null records that the post page was read and has no tag.
        locationTag:
          allOf: [{ $ref: '#/components/schemas/InstagramLocationTagDTO' }]
          nullable: true

    InstagramPostAttemptDTO:
      type: object
      required: [id, stage, error, createdAt]
      properties:
        id: { type: string }
        stage: { type: string }
        error: { type: string }
        createdAt: { type: string, format: date-time }

    InstagramSegmentDTO:
      type: object
      required: [start, text]
      properties:
        start: { type: number, format: double }
        end: { type: number, format: double, nullable: true }
        text: { type: string }
        confidence: { type: number, format: double, nullable: true, description: OCR confidence }

    CreateInstagramPostTextRequest:
      type: object
      required: [kind]
      properties:
        kind: { $ref: '#/components/schemas/InstagramTextKind' }
        language: { type: string, nullable: true }
        segments: { type: array, items: { $ref: '#/components/schemas/InstagramSegmentDTO' } }
        fullText: { type: string, nullable: true }
        params: { type: string, nullable: true, description: Tool settings as a JSON string }

    InstagramPostTextDTO:
      type: object
      required: [id, postId, kind, segmentCount, createdAt]
      properties:
        id: { type: string }
        postId: { type: string }
        kind: { $ref: '#/components/schemas/InstagramTextKind' }
        language: { type: string, nullable: true }
        segmentCount: { type: integer }
        segments:
          type: array
          nullable: true
          description: Included only when a single text is requested
          items: { $ref: '#/components/schemas/InstagramSegmentDTO' }
        fullText: { type: string, nullable: true }
        params: { type: string, nullable: true }
        createdAt: { type: string, format: date-time }

    InstagramEvidenceDTO:
      type: object
      required: [source, quote, startSeconds]
      properties:
        source: { type: string, description: "caption, speech, onscreen, or location_tag" }
        quote: { type: string }
        startSeconds: { type: number, format: double, description: 0 for caption and location tag }

    InstagramExtractedPlaceInput:
      type: object
      required: [name]
      properties:
        name: { type: string, maxLength: 255 }
        nameFound: { type: boolean, nullable: true, description: Defaults to true }
        aliases: { type: array, items: { type: string } }
        category: { type: string, nullable: true }
        area: { type: string, nullable: true }
        description: { type: string, nullable: true }
        evidence: { type: array, items: { $ref: '#/components/schemas/InstagramEvidenceDTO' } }
        confidence:
          allOf: [{ $ref: '#/components/schemas/InstagramConfidence' }]
          nullable: true
        needsVerification: { type: boolean, nullable: true }
        reason: { type: string, nullable: true }
        geocodeStatus:
          allOf: [{ $ref: '#/components/schemas/InstagramGeocodeStatus' }]
          nullable: true
          description: Defaults to MATCHED when place is set, otherwise NOT_SEARCHED
        place:
          allOf: [{ $ref: '#/components/schemas/PlaceInput' }]
          nullable: true
        geocodeWarning: { type: string, nullable: true }
        sunreiSpotId: { type: string, nullable: true, description: An existing SunreiSpot this candidate already became; stored as APPROVED }

    CreateInstagramExtractionRunRequest:
      type: object
      required: [agent, status]
      properties:
        batchId: { type: string, nullable: true, maxLength: 32 }
        agent: { type: string, description: "codex, claude, or skill" }
        model: { type: string, nullable: true }
        promptSha256: { type: string, nullable: true }
        inputTextIds: { type: array, items: { type: string } }
        status: { $ref: '#/components/schemas/InstagramExtractionRunStatus' }
        promotion:
          allOf: [{ $ref: '#/components/schemas/InstagramPromotion' }]
          nullable: true
        promotionEvidence: { type: string, nullable: true }
        rawOutput: { type: string, nullable: true, description: This post's unmodified agent output item as a JSON string }
        error: { type: string, nullable: true }
        startedAt: { type: string, format: date-time, nullable: true }
        finishedAt: { type: string, format: date-time, nullable: true }
        places: { type: array, items: { $ref: '#/components/schemas/InstagramExtractedPlaceInput' } }

    InstagramExtractionRunDTO:
      type: object
      required: [id, postId, agent, inputTextIds, status, places, createdAt]
      properties:
        id: { type: string }
        postId: { type: string }
        batchId: { type: string, nullable: true }
        agent: { type: string }
        model: { type: string, nullable: true }
        promptSha256: { type: string, nullable: true }
        inputTextIds: { type: array, items: { type: string } }
        status: { $ref: '#/components/schemas/InstagramExtractionRunStatus' }
        promotion:
          allOf: [{ $ref: '#/components/schemas/InstagramPromotion' }]
          nullable: true
        promotionEvidence: { type: string, nullable: true }
        rawOutput: { type: string, nullable: true }
        error: { type: string, nullable: true }
        startedAt: { type: string, format: date-time, nullable: true }
        finishedAt: { type: string, format: date-time, nullable: true }
        places: { type: array, items: { $ref: '#/components/schemas/InstagramExtractedPlaceDTO' } }
        createdAt: { type: string, format: date-time }

    InstagramExtractedPlaceDTO:
      type: object
      required: [id, runId, postId, postTitle, permalink, name, nameFound, aliases, evidence,
                 needsVerification, geocodeStatus, reviewStatus, existingSpotIds, createdAt]
      properties:
        id: { type: string }
        runId: { type: string }
        postId: { type: string }
        postTitle: { type: string }
        permalink: { type: string }
        name: { type: string }
        nameFound: { type: boolean }
        aliases: { type: array, items: { type: string } }
        category: { type: string, nullable: true }
        area: { type: string, nullable: true }
        description: { type: string, nullable: true }
        evidence: { type: array, items: { $ref: '#/components/schemas/InstagramEvidenceDTO' } }
        confidence:
          allOf: [{ $ref: '#/components/schemas/InstagramConfidence' }]
          nullable: true
        needsVerification: { type: boolean }
        reason: { type: string, nullable: true }
        geocodeStatus: { $ref: '#/components/schemas/InstagramGeocodeStatus' }
        place:
          allOf: [{ $ref: '#/components/schemas/PlaceInput' }]
          nullable: true
        geocodeWarning: { type: string, nullable: true }
        reviewStatus: { $ref: '#/components/schemas/InstagramReviewStatus' }
        reviewedAt: { type: string, format: date-time, nullable: true }
        sunreiSpotId: { type: string, nullable: true }
        existingSpotIds:
          type: array
          description: Live spots in the account's Sunrei, other than this candidate's own, whose Place has this candidate's googleMapsId
          items: { type: string }
        createdAt: { type: string, format: date-time }

    ListInstagramExtractedPlacesResult:
      type: object
      required: [data, totalSize, totalElements]
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/InstagramExtractedPlaceDTO' } }
        totalSize: { type: integer }
        totalElements: { type: integer }
        nextToken: { type: string, nullable: true }

    ReviewInstagramExtractedPlaceRequest:
      type: object
      required: [reviewStatus]
      properties:
        reviewStatus:
          $ref: '#/components/schemas/InstagramReviewStatus'
        title: { type: string, nullable: true, maxLength: 128, description: Spot title; defaults to the post title }
        context: { type: string, nullable: true, description: Spot context; defaults to the candidate description }
        # Required for APPROVED unless the candidate has a suggested place.
        place:
          allOf: [{ $ref: '#/components/schemas/PlaceInput' }]
          nullable: true
        tagIds: { type: array, nullable: true, items: { type: string } }

    InstagramPostDetailDTO:
      type: object
      required: [post, texts, runs, attempts]
      properties:
        post: { $ref: '#/components/schemas/InstagramPostDTO' }
        texts:
          type: array
          description: Text summaries without segments, newest first
          items: { $ref: '#/components/schemas/InstagramPostTextDTO' }
        runs:
          type: array
          description: Extraction runs with candidates, newest first
          items: { $ref: '#/components/schemas/InstagramExtractionRunDTO' }
        attempts:
          type: array
          description: Recent failed attempts, newest first (at most 50)
          items: { $ref: '#/components/schemas/InstagramPostAttemptDTO' }
```

완료 조건: `./gradlew generateAdminApi`가 성공하고 위 DTO들이 `com.sunrei.generated.dto.admin`에
생긴다.

## 1.5 · `InstagramService`

파일: `sunrei-server/src/main/kotlin/com/sunrei/service/InstagramService.kt`.
`YoutubeService(sunreiService, pageTokenSecret)`처럼 만든다. 모든 메서드는 `transaction { }` 하나
안에서 돈다.

계정:
- `listAccounts()`: `created_at` 순. `postCount`와 `pendingPostCount`는 조회한 모든 계정에 대해
  `instagram_post`를 그룹으로 세는 쿼리 하나로 구한다. `YoutubeService.toPlaylistDTO`처럼 계정마다
  쿼리하지 않는다.
- `upsertAccount(id, request)`:
  - `id`는 숫자여야 한다(Instagram 사용자 ID는 숫자다). 아니면 400.
  - `sunreiId`는 삭제되지 않은 Sunrei여야 한다.
  - 다른 계정이 이미 쓰는 username이면(대소문자 무시) 409.
  - 수정할 때 null인 필드는 값을 바꾸지 않는다.
  - `backfillCompleted = true`이면 `backfill_cursor = NULL`, `backfill_completed_at = now`로 한다.
    `backfillCursor`가 null이 아니면 저장한다.

게시물:
- `upsertPosts(accountId, request)`: 계정이 없으면 404, 한 번에 100개를 넘으면 400. `id`로 중복을 없앤다(처음
  것을 쓴다). 게시물마다:
  - `shortcode`는 `permalink`에서 `instagram\.com/(?:[^/]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)`로
    뽑는다. 뽑히지 않는 permalink가 하나라도 있으면 요청 전체가 400이고 아무것도 쓰지 않는다.
  - `title = captionTitle(caption) ?: shortcode`.
  - 새 게시물은 `initialStatus`(기본 `PENDING`)로 넣는다.
  - 이미 있는 게시물은 캡션, 제목, 수치, product type, `updated_at`을 갱신하고 상태는 바꾸지 않는다.
    캡션을 고쳤다고 처리가 끝난 게시물을 다시 처리하지는 않는다.
  - 저장된 `account_id`가 다른 게시물이면 400이다. 미디어 ID는 전역에서 유일하다.
  - 계정의 `last_synced_at`을 갱신한다.
- `captionTitle(caption)`: `#\S+` 토큰을 지우고 앞뒤의 ` -·|`를 다듬은 뒤에도 4자 이상 남는 첫 줄을
  128자로 자른다. 그런 줄이 없으면 null. 프로토타입이 spot 제목에 쓴 규칙이다.
- `listPosts(accountId, status, mediaType, locationTagRead, nextToken, size)`: `posted_at` 내림차순,
  같으면 `id` 순. `locationTagRead=false`는 `location_tag_read_at IS NULL`인 게시물이다.
- `getPostDetail(id)`: 게시물, 텍스트(최신순, segments 없이), 추출 기록(최신순, 후보 포함), 최근 시도
  50개. `getVideoDetail`과 같은 모양이다.
- `updatePost(id, request)`: `YoutubeService.updateVideo`와 같은 규칙이다. `REVIEW_PENDING`과
  `COMPLETED`에서 `processed_at`을 기록하고, 비어 있지 않은 error는 시도로 남긴다.
- `setLocationTag(id, request)`: 태그(없으면 SQL NULL)를 저장하고 `location_tag_read_at = now`로 한다.

텍스트:
- `createText(postId, request)`, `getText(id)`: YouTube와 같다.

추출 기록:
- `createRun(postId, request)`:
  1. 기록을 넣는다. 실패한 기록(`FAILED`)에 장소가 있으면 400이다.
  2. `status = SUCCEEDED`이면 `promotion`과 `promotion_evidence`를 게시물에 복사하고, 이 게시물의
     이전 기록에서 나온 `PENDING` 후보를 `SUPERSEDED`(`reviewed_at = now`)로 표시한다. 승인되거나
     반려된 후보는 그대로 둔다.
  3. 후보를 넣는다. 단, `promotion`이 `DISCLOSED_AD`나 `SELF_PROMOTION`이면 `places`를 저장하지
     않는다(`raw_output`에는 남는다). 광고 규칙을 클라이언트마다 두지 않고 서버 한곳에서 지키기
     위해서다.
  4. 후보마다:
     - `nameFound = false`이면 `geocode_status = NOT_SEARCHED`로 하고, `place`가 와도 버린다.
     - 그 밖에는 `geocodeStatus`의 기본값이 `place`가 있으면 `MATCHED`, 없으면 `NOT_SEARCHED`다.
       `MATCHED`나 `NAME_MISMATCH`인데 `place`가 없으면 400이고, 다른 상태에서는 `place`를 버린다.
     - `needsVerification`이 오지 않으면 상호 미확인 후보는 true, 나머지는 false다.
     - `sunreiSpotId`(삭제되지 않은 기존 spot)가 있으면 후보를 `APPROVED`로 저장한다.
     - 길이는 YouTube처럼 컬럼 크기에 맞게 자른다.
- 게시물 상태는 그 뒤에 호출한 쪽이 정한다. 대기 중인 후보가 있으면 `REVIEW_PENDING`, 없으면
  `COMPLETED`다. YouTube 수집기와 같다.

후보:
- `listPlaces(reviewStatus, geocodeStatus, accountId, postId, nextToken, size)`:
  - `postTitle`과 `permalink`를 위해 `instagram_post`와 조인한다.
  - `accountId`는 조인에서 `instagram_post.account_id`로 거른다. YouTube처럼 게시물 ID 목록을
    `inList`로 넘기지 않는다. 그 목록은 계정이 커질수록 길어진다.
  - 오래된 순.
  - `existingSpotIds`는 페이지마다 쿼리 하나를 더 해서 채운다. 해당 계정들의 Sunrei에 있는 삭제되지
    않은 spot을 `place`와 조인해 `google_maps_id IN (페이지의 ID들)`로 찾는다. 후보 자신이 만든 spot은 뺀다.
- `reviewPlace(id, request)`:
  1. 후보를 `FOR UPDATE`(Exposed `.forUpdate()`)로 조회해서, 동시에 승인해도 spot이 두 개 생기지
     않게 한다. 없으면 404, 이미 `sunrei_spot_id`가 있으면 409.
  2. 요청에 `SUPERSEDED`가 오면 400.
  3. `APPROVED`:
     - 게시물 계정에 삭제되지 않은 `sunrei_id`가 있어야 한다. 없으면 409.
     - 장소는 `request.place`, 없으면 제안된 장소다. 둘 다 없으면 400.
     - spot은 `sunreiService.addSpot(sunreiId, CreateSunreiSpotInline(title = request.title ?: post.title,
       context = request.context ?: candidate.description, sourceLink = post.permalink, place,
       tagIds = request.tagIds))`로 만든다.
  4. 검토 필드를 갱신한다. `request.place`가 오면 저장된 제안도 대체하고 `geocode_status = MATCHED`로
     한다.
  5. 게시물에 `PENDING` 후보가 남지 않았고 게시물이 `REVIEW_PENDING`이면 `COMPLETED`로 한다.

중복: 같은 Sunrei에 이미 spot이 있는 장소의 후보도 승인할 수 있다. 공개 카드는 한 Sunrei의 같은 장소
spot을 이미 mention 하나로 합치고(SPEC.md의 "A mention is unique by `(place_id, sunrei_id)`"),
context가 있는 첫 spot이 대표가 된다. 검토자는 `existingSpotIds`를 보고 중복인 줄 알고서 반려하거나
남길 수 있다. 미결 사항 1 참고.

완료 조건: `./gradlew compileKotlin`이 통과한다.

## 1.6 · 라우트와 연결

파일:
- `routes/admin/InstagramRoutes.kt` (새 파일): `fun Route.adminInstagramRoutes()`. `YoutubeRoutes.kt`를
  따른다. 경로 파라미터, enum 쿼리는 `valueOf`로 파싱, `size`는 1–100으로 제한한다.
- `routes/admin/AdminRouteErrors.kt` (새 파일): `YoutubeRoutes.kt`의 private `handleErrors`를
  `internal suspend fun ApplicationCall.handleErrors(...)`로 옮겨 두 라우트에서 함께 쓴다. 잘못된 enum
  쿼리 값(`valueOf`의 `IllegalArgumentException`)은 지금처럼 400이다.
- `routes/admin/AdminRoutes.kt`: `adminYoutubeRoutes()` 뒤에 `adminInstagramRoutes()`를 추가한다.
- `di/DIConfiguration.kt`: `val instagramService = InstagramService(sunreiService, pageTokenSecret)`,
  `ServiceLocator.instagramService = instagramService`.
- `di/DIExtensions.kt`: `fun ApplicationCall.injectInstagramService()`.

완료 조건: 컴파일이 통과하고, 라우트가 `/admin/youtube/*`처럼 admin 인증 아래에서 응답한다.

## 1.7 · 체크포인트: 로컬에서 API 끝까지 확인

로컬 서버와 DB(`./gradlew run`, Postgres 5433)에서, 직접 발급한 admin 토큰으로 확인한다.

1. `username=choiza11`과 로컬 draft Sunrei로 `PUT /admin/instagram/accounts/17841401234567890`.
   다른 id에 같은 username을 대소문자만 바꿔 보내면 409.
2. 게시물 세 개(릴스, 사진, 캐러셀)로 `PUT …/posts` → `addedPostIds`가 세 개.
   - 캡션을 고쳐 다시 보내면 `updatedPostIds`에 들어가고, 제목은 바뀌고 상태는 그대로다.
   - 코드가 없는 permalink를 섞으면 400이고 아무것도 쓰지 않는다.
3. null로 `PUT /posts/{id}/location-tag` → `locationTagReadAt`이 생기고 `locationTag`는 null.
4. `POST …/texts`(WHISPER) 후 `GET /texts/{id}` → segments가 온다.
5. `POST …/extraction-runs`:
   - 지도에서 찾은 장소 하나, `place`까지 보낸 `nameFound=false` 장소 하나, `promotion=NONE`으로
     보내면 두 번째 장소의 `place`는 버려지고 `NOT_SEARCHED`가 된다.
   - 다른 두 게시물에 장소와 함께 `DISCLOSED_AD`, `SELF_PROMOTION`으로 보내면 후보가 저장되지 않고,
     게시물마다 홍보 분류가 남는다.
6. 첫 게시물에 두 번째 기록을 보내면 이전 `PENDING` 후보가 `SUPERSEDED`가 된다.
7. `PATCH /extracted-places/{id}`:
   - APPROVED → `sourceLink`가 permalink이고 제목이 게시물 제목인 spot이 생긴다.
   - 다시 APPROVED → 409.
   - `place` 없이 상호 미확인 후보를 승인하면 400.
8. `GET /extracted-places?accountId=…&geocodeStatus=NAME_MISMATCH`가 제대로 거른다. 다른 게시물에서
   이미 승인된 장소의 후보에는 `existingSpotIds`가 채워진다.
9. YouTube 후보를 승인하면 여전히 `sourceLink`가 `&t=`가 붙은 watch URL인 spot이 생긴다.

---

# PHASE 2 · 프론트엔드와 스크립트의 `source_link`와 `INSTAGRAM`

목표: admin 앱과 공개 앱이 바뀐 필드와 새 Source 타입으로 빌드되고, 기존 스크립트가 계속
동작한다.

## 2.1 · 타입 재생성

생성된 TS는 커밋되어 있고 Dockerfile은 codegen을 돌리지 않으므로, 다시 생성해서 커밋한다:

```bash
cd sunrei-frontend
pnpm --filter sunrei-app codegen     # app-api-spec.yaml -> packages/sunrei-app/src/dto/
pnpm --filter sunrei-admin codegen   # admin-api-spec.yaml -> packages/sunrei-admin/src/api/admin/
```

재생성하면 `SourceType`에 `Instagram: 'INSTAGRAM'`이, spot DTO에 `sourceLink`가 생긴다. 아래의
`Record<SourceType, string>` 맵들은 모든 타입을 채워야 하므로 INSTAGRAM 항목을 넣기 전까지 컴파일되지
않는다. 빠뜨리지 않게 하는 의도한 안전장치다.

## 2.2 · 프론트엔드 변경

YouTube 플레이어를 임베드하는 곳은 없다. spot 링크는 단순한 외부 링크이고, YouTube 주소를 해석하는
곳은 썸네일뿐인데 Instagram 주소에는 아무것도 돌려주지 않는다. 그래서 바꿀 것은 필드 이름과
라벨이다.

링크 라벨 규칙: 앱마다 `linkKind(url)` helper를 하나 둔다. 호스트가 youtube.com이나 youtu.be면
`youtube`, instagram.com이면 `instagram`, 그 밖에는 `web`이다.

- youtube: 지금처럼 "▶ YouTube ↗"
- instagram: "Instagram ↗"
- web: "Link ↗"

공개 앱(`packages/sunrei-app/src`):

| 파일 | 변경 |
|---|---|
| `components/panels.tsx:459-483` (`PDMention`) | `m.youtubeLink ?? m.sunreiLink` → `m.sourceLink ?? m.sunreiLink`. 하드코딩된 `<Play/> YouTube ↗` 라벨은 `linkKind`를 쓴다. 335, 457행 주석도 고친다 |
| `components/panels.tsx:686` (`spotsToPlaceCards`) | `youtubeLink: s.youtubeLink` → `sourceLink: s.sourceLink` |
| `components/panels.tsx:442-447` (`SRC_TYPE_LABEL`) | `INSTAGRAM: 'Instagram'` 추가 |
| `components/panels.tsx:195` | 검색의 "Channels" 행이 enum 값 그대로 대신 `SRC_TYPE_LABEL[s.type]`을 보여 준다 |
| `components/source-channel.tsx:12-17` (`TYPE_LABEL`) | `INSTAGRAM: 'Instagram'` 추가 |
| `components/source-channel.tsx:47, 78-87` | 외부 링크 라벨: YOUTUBE는 `watchOnYoutube`, INSTAGRAM은 새 키 `viewOnInstagram`, 나머지는 `whereToWatch` |
| `messages/en.json:42-43`, `messages/ko.json:42-43` | `source.viewOnInstagram` 추가: "View on Instagram ↗" / "인스타그램에서 보기 ↗" |

admin(`packages/sunrei-admin/src`):

| 파일 | 변경 |
|---|---|
| `lib/schemas.ts:35` | `youtubeLink` → `sourceLink` (검증은 그대로 `z.string().url().or(z.literal(''))`) |
| `components/SunreiForm.tsx:40, 111, 137` | 필드 이름 변경 |
| `components/sunrei-form/SpotCard.tsx:44, 69-82` | `sourceLink`를 본다. YouTube 썸네일은 YouTube 링크일 때만 그대로 보인다. placeholder는 "YouTube timestamp or Instagram post link" |
| `lib/schemas.ts:59` | source type enum에 `'INSTAGRAM'` 추가 |
| `lib/schemas.ts:67-74` | `externalUrl`을 YOUTUBE와 INSTAGRAM에서 필수로 |
| `components/SourceForm.tsx:24, 42, 67, 114-116, 156-184` | `TYPES`에 INSTAGRAM 추가. 설명 문구, URL 라벨, 이름·시놉시스 숨김에 쓰는 `isYoutube`를 `linksOut = type === 'YOUTUBE' \|\| type === 'INSTAGRAM'`으로 바꾼다. INSTAGRAM은 포스터 업로드를 계속 보여 준다(프로필 사진을 가져오는 스크립트가 없고, Instagram CDN 주소는 만료된다) |
| `components/SourcesList.tsx:9-14, 49` | `TYPE_BEHAVIOR.INSTAGRAM = 'links out ↗'`. 외부로 나가는 두 타입 모두 외부 링크 아이콘 |
| `components/sunrei-form/SourceSelectField.tsx:24-29` | `TYPE_BADGE.INSTAGRAM = 'Instagram'` |
| `app/(dashboard)/sources/page.tsx:30` | 부제 "(YouTube / Instagram / TV / Anime / Other)" |

`app/(dashboard)/sunreis/page.tsx`는 생성된 enum으로 타입 필터를 만들어서 고칠 필요가 없다.

## 2.3 · Python 스크립트와 문서

| 파일 | 변경 |
|---|---|
| `.claude/scripts/youtube/create_sunrei.py:57` | spot payload의 `youtubeLink` → `sourceLink` |
| spot을 쓰거나 읽는 다른 스크립트 | 같음 (`rg -n youtubeLink .claude`로 찾는다) |
| `.agents/skills/youtube-create-sunrei/SKILL.md:194, 211, 242, 269, 319` | 예시의 필드 이름 |
| `SPEC.md:34, 40-41, 207, 312, 317, 423, 530` | `sunrei_spot.source_link` / `sourceLink`, 그리고 CTA 규칙 `sourceLink ?? sunreiLink ?? source.externalUrl` |

완료 조건:
- `rg -n youtubeLink .claude .agents sunrei-frontend --glob '!**/generated/**'` 결과가 없다.
- `pnpm --filter sunrei-admin build`와 `pnpm --filter sunrei-app build`가 통과한다.
- `.claude/scripts/youtube`에서 `python3 -m unittest`가 통과한다.

## 2.4 · 체크포인트

로컬에서 확인한다.
- 기존 YouTube spot은 여전히 "▶ YouTube ↗"이고 타임스탬프 위치로 열린다.
- Instagram `sourceLink`가 있는 spot은 "Instagram ↗"이고 게시물이 열린다.
- `INSTAGRAM` 타입 Source는 채널 화면에 "View on Instagram ↗"가 보이고, admin source 폼에서 프로필
  URL을 필수로 넣어 만들 수 있다.

---

# PHASE 3 · 수집 스크립트와 스킬

목표: 명령 하나로 등록한 계정의 새 게시물을 `/admin/instagram/*`를 통해 DB에 모으고, 이미 처리한
choiza11 게시물 2,004개를 가져온다.

## 3.1 · 파일

프로토타입을 `.claude/scripts/instagram/`로 옮긴다. 기존 Instagram 스크립트처럼 `youtube/_common.py`를
함께 쓴다.

| 파일 | 역할 |
|---|---|
| `graph_api.py` | Business Discovery 클라이언트: 계정 필드와 미디어 페이지. 토큰은 `sops_secret`에서 읽는다. `x-app-usage`가 75%면 쉬고, #4/#17/#32/#613이면 기다리고, #190이면 갱신 안내와 함께 멈춘다 |
| `instagram_collection_api.py` | `/admin/instagram/*` 클라이언트. YouTube의 `CollectionApi`를 상속한다. `collection_api.py`로 두면 YouTube 모듈과 import 이름이 겹친다 |
| `instagram_accounts.py` | `list`, `add USERNAME --sunrei ID [--baseline skip|none]`, `update [--refresh-picture]` (`youtube_playlists.py`와 같은 방식). 프로필 사진을 Source 포스터(앱의 채널 아바타)로 넣는다. Instagram 사진 주소는 만료되므로 `/admin/images/upload-url`로 이미지 저장소에 복사한다. Source에 포스터가 없을 때만 넣고, `--refresh-picture`는 바꿔 넣는다. 수집기도 포스터가 없으면 채운다 |
| `location_tags.py` | 로그인하지 않은 게시물 페이지를 headless Chrome으로 읽는다. 5번 연속 실패하면 전에 읽은 게시물을 다시 열어 본다. 그것도 안 열리면 로그인 차단으로 보고 멈추고, 열리면 실패한 게시물만 숨김으로 기록하고 계속한다 |
| `download_reels.py`, `reel_evidence.py`, `token_status.py`, `refresh_token.py` | 이미 있음 |
| `extract_locations.py` + `prompts/extract_locations.md` + `extract_locations.schema.json` | 캡션, 위치 태그, 음성, OCR을 넣는 배치 추출(agent 호출 한 번에 15개). 지금 프로토타입 프롬프트를 쓴다 |
| `place_search.py` | YouTube의 이름 검사를 쓰는 Places Text Search(같은 이유로 `geocode.py`가 아닌 이름). `nameFound=false`는 건너뛴다. 지점 검사를 더한다: 한국 주소일 때 `area`에 있는 시·구·군이 돌아온 주소에 없으면 경고와 함께 `NAME_MISMATCH`로 한다(방울과꼬막 서순라점이 용산구 지점으로 잡힌 경우). 동은 도로명 주소에 거의 없어서 보지 않고, 입구·출구·항구로 끝나는 역이나 항구 이름은 뺀다. 워크스페이스의 지도 일치 578건 중 9건이 걸렸다 |
| `extraction_runs.py` | 추출 결과와 지오코딩을 텍스트·추출 기록 요청으로 바꾸는 공용 코드. 수집기와 가져오기가 함께 쓴다 |
| `renew_accounts.py` | 수집기 (3.2) |
| `import_workspace.py` | 프로토타입 워크스페이스를 한 번 가져오는 스크립트 (3.3) |
| `tests/test_instagram.py` | 캡션 제목, shortcode 파싱, 근거 매핑, 지점 검사, 배치 나누기 단위 테스트 |

## 3.2 · 수집기 흐름 (`renew_accounts.py`)

`--commit` 없이는 dry run이다. `syncEnabled`인 계정마다(또는 `--account USERNAME`):

1. `token_status`로 토큰을 확인하고, 만료됐으면 갱신 안내와 함께 멈춘다.
2. 새 게시물 목록을 받는다.
   - Business Discovery를 최신부터 넘기다가, 게시물이 모두 이미 저장된 첫 페이지에서 멈추고
     `PUT …/posts`로 저장한다.
   - 백필이 끝나지 않았으면(`backfillCursor`가 있으면) 커서부터 이어서 받고 페이지마다 커서를
     저장한다. 끝나면 `backfillCompleted`로 표시한다.
   - 시간당 한도 안에 머물도록 한 번에 최대 `--max-pages`(기본 10)페이지만 받는다.
3. `PENDING`/`FAILED` 게시물을 최신부터 최대 `--max-posts`(기본 30)개 처리한다.
   - 상태를 `PROCESSING`으로 한다.
   - 위치 태그를 읽어 `PUT …/location-tag`로 저장한다. 페이지마다 4–8초 간격을 둔다.
   - VIDEO는 다운로드, Whisper, OCR을 거쳐 `WHISPER`와 `OCR` 텍스트를 저장하고 영상 파일을 지운다.
   - 처리한 게시물을 배치로 추출한다. 게시물마다 기록 하나, 같은 `batchId`를 쓴다.
   - 후보마다 지오코딩하고 기록을 저장한다.
   - 대기 중인 후보가 있으면 `REVIEW_PENDING`, 없으면 `COMPLETED`로 한다. 실패하면 단계와 함께
     `FAILED`로 하고 시도를 기록한다.
4. `--stale-hours`(기본 24)보다 오래 `PROCESSING`인 게시물은 `FAILED`로 되돌린다.

## 3.3 · choiza11 설정과 가져오기

1. Source: prod에 프로토타입이 만든 choiza11의 `OTHER` Source가 있으면 그것을 쓰고 타입을
   `INSTAGRAM`으로 바꾼다. 없으면 새로 만든다(`type=INSTAGRAM`,
   `externalUrl=https://www.instagram.com/choiza11/`).
2. Sunrei: 프로토타입의 draft Sunrei가 있으면 그것을 쓴다. 그 안의 spot은 캡션만으로 추출한
   결과라서 지우고, 검토한 후보로 대신한다. draft라서 공개된 내용은 바뀌지 않는다. 없으면 draft
   "최자 인스타그램"을 만든다.
3. 그 Sunrei로 계정을 등록하고 게시물 2,004개 전체를 `PUT …/posts`로 넣는다. 게시물마다 위치 태그,
   Whisper와 OCR 텍스트, 최신 추출과 지오코딩을 기록으로 가져온다(후보는 `PENDING`). 워크스페이스에서
   과거 전체 처리를 이미 마쳤으므로 수집기를 기다리지 않는다.
4. API로 후보를 검토한 뒤 Sunrei를 공개한다.

## 3.4 · 스킬

- `instagram-to-sunrei`: 계정 등록, 수집기 실행, 후보 검토, 공개. 토큰 확인과 갱신 단계를 포함해
  `youtube-to-sunrei`를 따른다.
- `instagram-download-reels`: 이미 있음.

완료 조건:
- `python3 -m unittest tests.test_instagram`이 통과한다.
- prod를 대상으로 한 `renew_accounts.py` dry run이 choiza11의 새 게시물을 보여 준다.
- `--commit --max-posts 3`이 게시물 세 개를 끝까지 저장하고, 그 후보가
  `GET /admin/instagram/extracted-places`에 나온다.

---

# 릴리스

Phase 1과 2는 한 릴리스(`scripts/release.sh`)로 내보낸다. API 필드 이름이 바뀌어서 이전 프론트엔드는
새 서버와, 새 프론트엔드는 이전 서버와 맞지 않기 때문이다.

- 마이그레이션 잡은 ArgoCD PreSync 훅(`deploy/helm/templates/migration-job.yaml`)이라서, V3는 이전
  서버가 서비스하는 중에 돈다. V3는 컬럼 하나, 제약 값 하나, 새 테이블만 더하므로 이전 서버도 계속
  동작한다.
- 서버와 프론트엔드 배포 사이에는 이전 페이지가 `youtubeLink`를 찾지 못하고 `sunreiLink`(영상 URL)로
  대신한다. 몇 분 동안 mention 링크에서 타임스탬프가 빠진다.
- 배포 중에 이전 서버가 쓴 spot은 `youtube_link`에만 들어간다. V4가 옮긴다.
- V4는 `youtube_link`를 읽는 코드가 남지 않았는지 확인한 뒤 다음 릴리스로 내보낸다.

Phase 3은 스크립트뿐이라 릴리스가 필요 없다.

릴리스 후: `AGENTS.md`의 "YouTube 수집" 옆에 "Instagram 수집" 섹션을 추가하고 Source 타입 목록을
고친다. `SPEC.md`의 "Link ownership" 항목도 `sunrei_spot.source_link`로 고친다.

---

# 미결 사항

1. 여러 번 나온 장소의 대표 게시물. 공개 카드는 mention을 Sunrei 단위로 센다("영상 N개에 등장").
   계정 하나가 Sunrei 하나이므로, choiza11이 같은 장소를 세 번 올려도 한 번으로 센다. 그래서 후보는
   모두 승인해도 된다. 다만 그 mention을 대표하는 게시물은 쿼리가 돌려준 순서에서 "context가 있는
   첫 spot"이라 정해져 있지 않다.
   - 제안: 한 Sunrei의 같은 장소 spot을 context가 긴 순, 같으면 최신 순으로 정렬해서 가장 정보가
     많은 게시물이 대표가 되게 한다.
   - YouTube 플레이리스트에도 적용된다. 한 플레이리스트의 여러 영상이 같은 장소에서 똑같이 합쳐진다.
2. 개수 라벨. "영상 N개에 등장" / "Featured in N videos"는 Instagram 게시물에 맞지 않는다.
   - 제안: YouTube가 아닌 Source의 mention이 하나라도 있으면 "N곳에서 소개" / "Featured by N",
     아니면 지금 그대로.
3. 자체 홍보의 경계. 자체 홍보 규칙 때문에 빠지는 장소 15곳 중 7곳은 분자나 최자로드가 함께 나오는
   식당 리뷰다: 스시코우지, 경도회관, 영이네, 대물섬, 산골면옥, 청담동 치킨집, 최자로드 6의 돌솥밥집.
   - 제안: 게시물의 주제가 본인 상품·행사일 때만 빼고, 식당 리뷰에 분자나 최자로드가 곁들여진 글은
     후보로 둔다.
