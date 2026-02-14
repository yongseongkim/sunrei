# Project Sunrei

Sunrei는 영화, 드라마, 소설, 애니메이션 등의 촬영지나 배경이 된 장소를 찾아가는 '성지순례' 여행을 위한 지도 기반 웹 애플리케이션.
지도에서 작품별 장소들을 탐색할 수 있으며 클릭 시 상세정보를 얻을 수 있다.

도메인 관련 코드를 변경할 때, 해당 내용을 설명하는 AGENTS.md가 있다면 함께 업데이트한다.

## Architecture

Backend (Ktor + Exposed + PostgreSQL), Frontend (Next.js + TypeScript + Google Maps)

## Core Domain

### Sunrei

성지순례에서 파생된 용어로, 특정 콘텐츠(영화/드라마/소설/애니메이션)와 관련된 장소들의 집합체

### SunreiSpot

Sunrei에 속한 개별 장소로, 작품 내 특정 장면이나 에피소드와 연결된 실제 장소
예를 들어, "7화에서 주인공이 울면서 식사한 식당" 같이 하나의 Place 와 연결된다.

### Place

실제 위치 정보로 현재는 GoogleMaps 정보를 이용한다.
여러 작품에 "도쿄역" 이 등장하듯이, 여러 SunreiSpot 이 한 Place 를 가리킬 수 있다.
