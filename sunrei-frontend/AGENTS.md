# Sunrei Frontend

Sunrei의 Next.js 앱 두 개를 담은 pnpm workspace다.
도메인 용어(Source, Sunrei, SunreiSpot, Place, Tag)와 배포 방식은 [루트 AGENTS.md](../AGENTS.md)를 따른다.

## 구성

- `packages/sunrei-app`: 지도에서 성지순례 장소를 찾는 public 앱이다.
- `packages/sunrei-admin`: Source와 Sunrei를 등록하고 공개하는 admin 앱이다.
  데스크톱 화면만 지원한다.
- 두 앱은 별개의 제품으로 보고 코드를 공유하지 않는다.
  비슷한 컴포넌트도 패키지마다 따로 둔다.
- 공통 스택은 Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, shadcn/ui, TanStack Query, Google Maps JavaScript API다.
- public 앱의 화면 상태는 Zustand store에 두고, admin 폼은 react-hook-form과 zod 스키마(`src/lib/schemas.ts`)로 검증한다.

## API client

- API 계약은 repo 루트의 `sunrei-api/`에 있다.
  sunrei-app은 `app-api-spec.yaml`, sunrei-admin은 `admin-api-spec.yaml`을 쓴다.
- `pnpm codegen`이 OpenAPI Generator의 typescript-axios로 client와 DTO를 만든다.
  출력 디렉터리는 sunrei-app `src/dto/`, sunrei-admin `src/api/admin/`이며 git에 커밋한다.
- codegen은 출력 디렉터리를 지우고 다시 만들므로 생성 코드는 손으로 고치지 않는다.
  스펙을 고치고 codegen을 다시 돌린다.
- openapi-generator-cli는 generator jar를 실행하므로 codegen에는 Java가 필요하다.
- sunrei-server도 같은 스펙에서 DTO를 생성하므로 스펙을 바꾸면 양쪽을 함께 다시 생성한다.
- `POST /api/auth/google`은 스펙에 없어서 두 앱 모두 axios로 직접 호출한다.

## 실행과 검증

pnpm 11을 쓴다.

```bash
pnpm install
pnpm dev:app
pnpm dev:admin
pnpm build
pnpm lint
pnpm codegen
```

- 개발 서버는 sunrei-app이 3000번, sunrei-admin이 3001번 포트를 쓴다.
  `pnpm dev`는 둘을 함께 띄운다.
- 테스트 코드는 없다.
  `next build`가 타입 검사를 하고, `next.config.ts`가 빌드 중 ESLint를 끄므로 lint는 `pnpm lint`로 따로 돌린다.
- 환경 변수는 각 패키지의 `.env.local`에 두며 이 파일은 git에 올리지 않는다.
- 두 앱 모두 `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`를 읽는다.
  `NEXT_PUBLIC_API_URL`이 없으면 `http://localhost:3030`으로 요청한다.
- sunrei-admin은 `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`도 읽는다.
  AdvancedMarkerElement는 map ID가 있어야 그려지므로 값이 없으면 `DEMO_MAP_ID`를 쓴다.
- `NEXT_PUBLIC_*` 값은 빌드할 때 번들에 들어가므로 운영 이미지는 CI가 build arg로 값을 넣어 빌드한다.
- Google Maps API key에는 Maps JavaScript API, Places API, Geocoding API가 모두 켜져 있어야 한다.
  public 앱의 검색 자동완성, 위치 이동, 지도 영역 이름이 Places와 Geocoding을 쓴다.

## 로그인

- 두 앱 모두 Google Identity Services의 token client로 받은 access token을 `POST /api/auth/google`의 `idToken` 필드에 담아 보낸다.
  서버는 이 값으로 Google userinfo를 조회한 뒤 JWT와 사용자 정보를 돌려준다.
- sunrei-app은 JWT와 사용자 정보를 localStorage에 둔다.
  로그인해야 쓸 수 있는 기능은 없다.
- sunrei-admin은 role이 admin인 사용자의 JWT만 `adminToken` cookie에 저장하고, 그 밖의 사용자는 `/forbidden`으로 보낸다.
- admin 화면 접근은 클라이언트가 cookie 유무로만 확인하고, `src/middleware.ts`는 요청을 그대로 통과시킨다.
  `/admin/*` API 권한은 서버가 JWT의 role로 확인한다.

## sunrei-app

모든 화면을 지도 페이지 하나(`src/app/page.tsx`)에서 처리한다.
장소 상세, 채널 화면, Sunrei 미리보기는 route가 아니라 데스크톱 사이드바나 모바일 아래 시트 안에서 바뀌는 패널이다.
화면 폭이 1024px보다 좁으면 모바일 배치를 쓴다.
태그 필터와 로그인 모달도 같은 기준(`isMobile`)으로 모바일에서는 아래 시트로 연다.
앱은 라이트 테마만 쓰며, 지도 핀, 별점, 영업 중 표시 색도 `globals.css` 토큰(`--pin`, `--pin-selected`, `--star`, `--success`)에서 가져온다.

지도 상태는 두 기본 모드와 그 위에 겹치는 패널로 나뉜다.

- nearby 모드는 기본 모드다.
  지도 화면 영역(`swLat,swLng,neLat,neLng`) 안의 장소를 `GET /api/map`으로 가져온다.
  지도를 옮기면 "이 주변 검색" 버튼을 눌러야 새 영역을 불러오고, 지금 영역에 장소가 없으면 버튼 없이 바로 불러온다.
  버튼은 데스크톱에서는 지도 아래 가운데, 모바일에서는 하단 시트에 가리지 않도록 지역 칩 줄 아래에 두고 시트를 끝까지 펼치면 숨긴다.
- source 모드는 검색이나 "주변 소스" 레일에서 Source를 고르면 들어간다.
  화면 영역과 관계없이 그 Source의 모든 장소를 `sourceIds`로 가져와 지도를 거기에 맞추고, 지도를 옮겨도 다시 불러오지 않는다.
  목록 자리에는 채널 화면이 보인다.
- Sunrei 미리보기(`ui-store`의 `videoPreview`)는 채널 화면에서 Sunrei를 고르거나 검색에서 영상을 고르면 열린다.
  그 Sunrei의 장소만 지도와 목록에 보여 준다.
- 장소 상세(`activePlaceId`)는 핀이나 카드를 누르면 열리고, 미리보기보다 우선해서 보인다.

동작 규칙은 다음과 같다.

- 거리 계산과 정렬 기준은 GPS가 아니라 지도 중심(`mapCenter`)이다.
  위치 권한은 처음 보여 줄 지도 위치만 정하고, 권한이 없으면 서울에서 시작한다.
- nearby와 source 모드의 PlaceCard는 서버가 언급을 묶고 정렬해서 내려준다.
  미리보기 목록만 Sunrei의 spot을 브라우저에서 장소별 카드로 묶는다.
  배너가 이미 Source와 시리즈를 보여 주므로, 미리보기 카드는 언급 대신 spot마다 회차 제목과 맥락 한 줄씩을 보여 주고 "이 시리즈에서 N번"으로 센다.
- 장소 상세의 언급 링크는 spot의 `sourceLink`, 없으면 Sunrei 링크로 보내며, 주소에 따라 YouTube, Instagram, Link로 표시한다.
  언급의 `images`(spot 이미지, 없으면 Sunrei 이미지)를 링크와 함께 보여 주며, YouTube 썸네일은 16:9 한 장, 그 밖에는 정사각형 최대 4장이다.
- 태그 필터는 서버에 다시 묻지 않고 이미 받은 장소를 브라우저에서 거른다.
  선택한 태그를 모두 가진 장소만 목록에 남기고, 지도에서는 나머지 핀을 흐리게 표시한다.
- 장소의 `isClosed`가 참이면 PlaceCard와 장소 상세의 이름 옆에 "폐업" 칩을 보여 준다.
- Sunrei는 화면에서 "시리즈"라고 부른다. YouTube 재생목록, Instagram 계정, 기사 시즌이 모두 Sunrei라 "영상"이 맞지 않기 때문이다.
  카드 눈썹은 Source가 하나면 "{n}번 소개됨", 둘 이상이면 "소스 {n}개가 소개"다.
- Source 타입 이름과 언급 링크 라벨도 번역 키(`sourceType.*`, `detail.link*`)로 보여 준다.
- URL query의 `sourceIds`, `tags`, `place`, `sunrei`로 deep link를 만든다.
  지도 페이지를 다시 불러오지 않도록 `history.replaceState`로 URL만 바꾼다.
- locale은 URL 경로나 cookie 없이 `Accept-Language`로 정하고, 지원하지 않는 언어면 한국어로 보여 준다.
  문구는 `messages/ko.json`과 `messages/en.json`에 있다.
- 장소 상세의 "Google 정보" 카드는 브라우저에서 Places Details를 직접 호출하며, 이 요청에는 Google 요금이 나간다.

코드 위치는 다음과 같다.

- `src/stores/`: `map-store`는 모드, 불러온 영역, 지도 인스턴스를, `ui-store`는 패널, 검색, 미리보기를, `filter-store`는 선택한 태그를 가진다.
- `src/hooks/use-map.ts`: 지도와 상세 조회, 태그 필터 selector가 있다.
  deep link는 `use-deep-link.ts`, Google Places와 Geocoding 호출은 `use-google-places.ts`에 있다.
- `src/components/`: `map-view.tsx`는 OverlayView 핀을, `panels.tsx`는 검색, 장소 상세, 미리보기를 그린다.
  `source-channel.tsx`는 채널 화면, `desktop/`과 `mobile/`은 화면별 배치, `wf/`는 작은 공용 UI다.
- `/dev`는 백엔드 없이 PlaceCard 상태를 눈으로 확인하는 개발용 페이지다.

## sunrei-admin

- 메뉴는 Content(`/sunreis`), Channels / Sources(`/sources`), Places(`/places`), Tags(`/tags`)이며 `/`는 `/sunreis`로 보낸다.
- Sunrei 폼(`src/components/SunreiForm.tsx`, `src/components/sunrei-form/`)은 Source, 공개 상태, 요약, 이미지, spot 목록을 한 요청으로 저장한다.
  요청에서 빠진 기존 spot은 서버가 삭제한다.
- spot의 장소는 `PlaceSearchModal`에서 Google Places 검색, 좌표 입력, 지도 클릭 중 하나로 고른다.
  검색 결과나 지도의 가게 아이콘으로 고르면 Google place ID도 저장해, 서버의 장소 중복 판정과 앱의 Google 정보 카드에 쓴다.
  빈 곳 클릭과 좌표 입력은 Google place ID 없이 저장한다.
- 저장할 때 spot마다 제목, 장소, 링크 형식을 검사해, 오류가 있는 spot 카드에 빨간 테두리와 필드별 문구를 보이고 Save 옆에 오류 spot 수를 보인다.
  오른쪽 지도의 핀 번호는 spot 목록 번호와 같다.
- 공개 상태는 `published` 값으로 보내고 `published_at`은 서버가 정한다.
  공개된 Sunrei를 다시 저장해도 처음 공개한 시각이 유지되고, 공개를 해제하면 `published_at`을 지운다.
- 이미지는 `/admin/images/*` API로 서버에 올리며 Sunrei당 10장, spot당 5장까지다.
- 태그는 spot에 붙는다.
  폼에서 없는 태그를 입력하면 한국어와 영어 라벨을 모두 입력값으로 만들고, 영어 번역은 Tags 화면에서 고친다.
- YouTube와 Instagram Source는 `externalUrl`(채널이나 프로필 주소)이 필수다.
- spot 카드의 썸네일은 링크가 YouTube면 영상 썸네일, 아니면 spot의 첫 이미지(Instagram 게시물 이미지 등)다.
- Places 화면에서 장소를 폐업으로 바꾸거나 되돌리고, Edit 시트에서 이름, 주소, 좌표, Google place ID, 폐업 사유, 메모를 고친다(`PATCH /admin/places/{id}`).
  폐업은 장소 단위라 그 장소를 가리키는 모든 spot에 함께 보이며, 오류가 아니라 기록 상태라 앱과 같은 중립 외곽선 배지로 보인다.
