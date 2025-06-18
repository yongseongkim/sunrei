import { DataSource } from 'typeorm';
import { Image } from '../model/image';
import { Place } from '../model/place.entity';
import { SunreiSpot } from '../model/sunrei-spot.entity';
import { Sunrei } from '../model/sunrei.entity';
import { Tag } from '../model/tag.entity';

// Mock image data
const mockImages: Record<string, Image[]> = {
  kodoku: [
    {
      url: 'https://picsum.photos/seed/kodoku1/800/600',
      width: 800,
      height: 600,
      displayOrder: 1,
    },
    {
      url: 'https://picsum.photos/seed/kodoku2/800/600',
      width: 800,
      height: 600,
      displayOrder: 2,
    },
  ],
  kodoku2: [
    {
      url: 'https://picsum.photos/seed/kodoku2-1/800/600',
      width: 800,
      height: 600,
      displayOrder: 1,
    },
    {
      url: 'https://picsum.photos/seed/kodoku2-2/800/600',
      width: 800,
      height: 600,
      displayOrder: 2,
    },
  ],
  kodoku3: [
    {
      url: 'https://picsum.photos/seed/kodoku3-1/800/600',
      width: 800,
      height: 600,
      displayOrder: 1,
    },
    {
      url: 'https://picsum.photos/seed/kodoku3-2/800/600',
      width: 800,
      height: 600,
      displayOrder: 2,
    },
  ],
  kodoku4: [
    {
      url: 'https://picsum.photos/seed/kodoku4-1/800/600',
      width: 800,
      height: 600,
      displayOrder: 1,
    },
    {
      url: 'https://picsum.photos/seed/kodoku4-2/800/600',
      width: 800,
      height: 600,
      displayOrder: 2,
    },
  ],
};

interface PlaceData {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface SunreiData {
  title: string;
  description: string;
  link: string;
  images: Image[];
  tagNames: string[];
}

interface SpotData {
  title: string;
  description: string;
  placeName: string;
  sunreiTitle: string;
  images: Image[];
}

export async function seedDatabase(dataSource: DataSource) {
  const sunreiRepo = dataSource.getRepository(Sunrei);
  const placeRepo = dataSource.getRepository(Place);
  const sunreiSpotRepo = dataSource.getRepository(SunreiSpot);
  const tagRepo = dataSource.getRepository(Tag);

  // 1. Create Tag data first
  console.log('🏷️  Creating Tag data...');
  const tagData = [
    {
      name: '드라마',
      description: '일본 드라마 작품',
    },
    {
      name: '음식',
      description: '음식을 테마로 한 작품',
    },
  ];
  
  const tags = [];
  for (const data of tagData) {
    const tag = tagRepo.create(data);
    const savedTag = await tagRepo.save(tag);
    tags.push(savedTag);
  }
  console.log(`✅ Created ${tags.length} Tag entries`);

  // Tag map for easy access
  const tagMap: Record<string, Tag> = {};
  tags.forEach((tag) => {
    tagMap[tag.name] = tag;
  });

  // 2. Create Place data
  console.log('📌 Creating Place data...');
  const placesData: PlaceData[] = [
    // 고독한 미식가 시즌1 장소들
    {
      name: 'SōkaBokka',
      address: '도쿄도 미나토구',
      latitude: 35.642907,
      longitude: 139.6992731,
    },
    {
      name: 'Sumire',
      address: '도쿄도 스미다구',
      latitude: 35.7198195,
      longitude: 139.7649837,
    },
    {
      name: 'せきざわ食堂',
      address: '도쿄도 이타바시구',
      latitude: 35.731064,
      longitude: 139.684662,
    },
    {
      name: 'HIROKI 下北沢店',
      address: '도쿄도 세타가야구 시모키타자와',
      latitude: 35.6601056,
      longitude: 139.66783,
    },
    {
      name: 'カヤシマ',
      address: '도쿄도 도시마구',
      latitude: 35.7060013,
      longitude: 139.5789614,
    },
    {
      name: 'とんかつ みやこや',
      address: '도쿄도 이타바시구',
      latitude: 35.7236325,
      longitude: 139.638764,
    },
    {
      name: 'Fishing pond Musashino Gardens',
      address: '도쿄도 미타카시',
      latitude: 35.6858052,
      longitude: 139.6395461,
    },
    {
      name: 'LocoDish',
      address: '치바현 우라야스시',
      latitude: 35.6396034,
      longitude: 139.9288341,
    },
    {
      name: '中国家庭料理 楊 2号店',
      address: '도쿄도 이타바시구',
      latitude: 35.730042,
      longitude: 139.7072349,
    },
    {
      name: '和食亭',
      address: '도쿄도 이타바시구',
      latitude: 35.737363,
      longitude: 139.750474,
    },
    {
      name: 'Shiyousuke',
      address: '도쿄도 미나토구',
      latitude: 35.6711356,
      longitude: 139.796421,
    },
    {
      name: '야키니쿠 징기스칸 츠루야',
      address: '카나가와현 요코하마시',
      latitude: 35.525018,
      longitude: 139.6946078,
    },
    // 고독한 미식가 시즌2 장소들
    {
      name: 'お食事 樹',
      address: '도쿄도 도시마구',
      latitude: 35.7000917,
      longitude: 139.5588799,
    },
    {
      name: 'タイ国料理ライカノ',
      address: '도쿄도 아다치구',
      latitude: 35.749283399999996,
      longitude: 139.8034846,
    },
    {
      name: '田や',
      address: '도쿄도 아다치구',
      latitude: 35.7615165,
      longitude: 139.7229092,
    },
    {
      name: '砂町銀座商店街',
      address: '도쿄도 고토구',
      latitude: 35.6797307,
      longitude: 139.8312915,
    },
    {
      name: 'Ōuchi',
      address: '도쿄도 에도가와구',
      latitude: 35.693564599999995,
      longitude: 139.79316,
    },
    {
      name: 'つちや食堂',
      address: '치바현',
      latitude: 35.702504399999995,
      longitude: 140.706369,
    },
    {
      name: '珍々',
      address: '도쿄도 아다치구',
      latitude: 35.738141299999995,
      longitude: 139.8802298,
    },
    {
      name: 'キッチン友',
      address: '카나가와현',
      latitude: 35.4889295,
      longitude: 139.6268748,
    },
    {
      name: 'レストラン・ブラジル',
      address: '토치기현',
      latitude: 36.2605607,
      longitude: 139.4071525,
    },
    {
      name: '平和苑',
      address: '도쿄도 분쿄구',
      latitude: 35.718711899999995,
      longitude: 139.6601431,
    },
    {
      name: '三ちゃん食堂',
      address: '도쿄도 오타구',
      latitude: 35.5808587,
      longitude: 139.6611988,
    },
    {
      name: 'なかやま',
      address: '도쿄도 에도가와구',
      latitude: 35.6840785,
      longitude: 139.7826743,
    },
    // 고독한 미식가 시즌3 장소들
    {
      name: 'トリツバキ',
      address: '도쿄도 스미다구',
      latitude: 35.7206604,
      longitude: 139.7805827,
    },
    {
      name: 'どん平',
      address: '도쿄도 아다치구',
      latitude: 35.74905,
      longitude: 139.7651672,
    },
    {
      name: 'Parlour',
      address: '도쿄도 이타바시구',
      latitude: 35.7435226,
      longitude: 139.6752771,
    },
    {
      name: 'ボラーチョ',
      address: '도쿄도 세타가야구',
      latitude: 35.655305,
      longitude: 139.6889907,
    },
    {
      name: '山源',
      address: '도쿄도 이타바시구',
      latitude: 35.747288,
      longitude: 139.7188629,
    },
    {
      name: 'PAO Caravan Sarai',
      address: '도쿄도 분쿄구',
      latitude: 35.7058495,
      longitude: 139.6824089,
    },
    {
      name: 'わさび園 かどや',
      address: '시즈오카현',
      latitude: 34.79403,
      longitude: 138.9353391,
    },
    {
      name: 'Izakaya Restaurant',
      address: '도쿄도 분쿄구',
      latitude: 35.7081233,
      longitude: 139.7334983,
    },
    {
      name: '第一亭',
      address: '카나가와현',
      latitude: 35.4456444,
      longitude: 139.6280667,
    },
    {
      name: '川栄',
      address: '도쿄도 아다치구',
      latitude: 35.7800778,
      longitude: 139.720191,
    },
    {
      name: 'だるまや',
      address: '도쿄도 오타구',
      latitude: 35.6094611,
      longitude: 139.7356806,
    },
    {
      name: '峠の茶屋蔵',
      address: '니가타현',
      latitude: 37.1334401,
      longitude: 138.562581,
    },
    // 고독한 미식가 시즌4 장소들
    {
      name: 'さいき',
      address: '도쿄도 아다치구',
      latitude: 35.7763598,
      longitude: 139.8311173,
    },
    {
      name: 'ティティ',
      address: '도쿄도 시나가와구',
      latitude: 35.6103051,
      longitude: 139.7170506,
    },
    {
      name: 'アトム',
      address: '도쿄도 코토구',
      latitude: 35.678298,
      longitude: 139.8200321,
    },
    {
      name: 'Teppan Chinese Shan Wei',
      address: '도쿄도 세타가야구',
      latitude: 35.6406901,
      longitude: 139.6638468,
    },
    {
      name: "YO-HO's cafe Lanai",
      address: '도쿄도 치요다구',
      latitude: 35.695758,
      longitude: 139.7542606,
    },
    {
      name: '居酒屋まめぞ',
      address: '도쿄도 세타가야구',
      latitude: 35.6436595,
      longitude: 139.668927,
    },
    {
      name: 'Kamarupuru',
      address: '도쿄도 신주쿠구',
      latitude: 35.6913418,
      longitude: 139.7054822,
    },
    {
      name: '乙姫',
      address: '도쿄도 분쿄구',
      latitude: 35.7148346,
      longitude: 139.747086,
    },
    {
      name: '大幸園',
      address: '카나가와현 카와사키시',
      latitude: 35.5316972,
      longitude: 139.7008133,
    },
    {
      name: 'いろり家',
      address: '도쿄도 타마시',
      latitude: 35.6371659,
      longitude: 139.4463568,
    },
    {
      name: 'Najimitei',
      address: '카나가와현 요코하마시',
      latitude: 35.4614984,
      longitude: 139.6223261,
    },
    {
      name: 'Miyuki Shokudō',
      address: '도쿄도 미나토구',
      latitude: 35.6659039,
      longitude: 139.7577863,
    },
  ];

  const places = [];
  for (const data of placesData) {
    const place = placeRepo.create(data);
    const savedPlace = await placeRepo.save(place);
    places.push(savedPlace);
  }
  console.log(`✅ Created ${places.length} Place entries`);

  // Create place map for easy access
  const placeMap: Record<string, Place> = {};
  places.forEach((place) => {
    placeMap[place.name] = place;
  });

  // 3. Create Sunrei data with tags
  console.log('📌 Creating Sunrei data...');
  const sunreisData: SunreiData[] = [
    {
      title: '고독한 미식가 시즌1',
      description:
        '수입 잡화상을 운영하는 이노가시라 고로가 도쿄와 그 근교를 돌며 혼자 식사를 즐기는 드라마. 2012년 1월부터 3월까지 방영된 첫 번째 시즌으로, 실제 음식점들이 등장하여 방영 후 많은 팬들이 찾는 맛집 성지가 되었다.',
      link: 'https://www.tv-tokyo.co.jp/kodokunogurume/',
      images: mockImages.kodoku,
      tagNames: ['드라마', '음식'],
    },
    {
      title: '고독한 미식가 시즌2',
      description:
        '이노가시라 고로의 맛집 탐방이 계속되는 두 번째 시즌. 2012년 10월부터 12월까지 방영되었으며, 도쿄를 넘어 더 넓은 지역의 숨은 맛집들을 소개한다. 시즌1의 인기에 힘입어 더욱 다양한 장르의 음식점들이 등장한다.',
      link: 'https://www.tv-tokyo.co.jp/kodokunogurume2/',
      images: mockImages.kodoku2,
      tagNames: ['드라마', '음식'],
    },
    {
      title: '고독한 미식가 시즌3',
      description:
        '더욱 다채로워진 고로의 미식 여행 세 번째 시즌. 2013년 7월부터 9월까지 방영. 도쿄 근교는 물론 시즈오카, 니가타 등 지방의 맛집까지 소개하며, 일본 전국의 숨은 맛집을 발굴하는 여정이 펼쳐진다.',
      link: 'https://www.tv-tokyo.co.jp/kodokunogurume3/',
      images: mockImages.kodoku3,
      tagNames: ['드라마', '음식'],
    },
    {
      title: '고독한 미식가 시즌4',
      description:
        '시리즈의 네 번째 시즌. 2014년 7월부터 9월까지 방영. 고로의 사업 범위가 넓어지면서 더욱 다양한 지역의 맛집을 탐방한다. 베트남 요리, 네팔 요리 등 이국적인 요리도 등장하여 미식의 지평을 넓힌다.',
      link: 'https://www.tv-tokyo.co.jp/kodokunogurume4/',
      images: mockImages.kodoku4,
      tagNames: ['드라마', '음식'],
    },
  ];

  const sunreis = [];
  for (const data of sunreisData) {
    const sunrei = sunreiRepo.create({
      title: data.title,
      description: data.description,
      link: data.link,
      images: data.images,
      tags: data.tagNames.map((tagName) => tagMap[tagName]),
    });
    const savedSunrei = await sunreiRepo.save(sunrei);
    sunreis.push(savedSunrei);
  }
  console.log(`✅ Created ${sunreis.length} Sunrei entries`);

  // Create sunrei map for easy access
  const sunreiMap: Record<string, Sunrei> = {};
  sunreis.forEach((sunrei) => {
    sunreiMap[sunrei.title] = sunrei;
  });

  // 4. Create SunreiSpot data
  console.log('📌 Creating SunreiSpot data...');
  const spotsData: SpotData[] = [
    // 고독한 미식가 시즌1 spots
    {
      title: 'SōkaBokka - 이탈리안의 숨은 보석',
      description:
        '시즌1 제1화 등장. 미나토구의 숨은 이탈리안 레스토랑. 고로상이 즐긴 파스타와 와인이 인상적이었던 곳.',
      placeName: 'SōkaBokka',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: 'Sumire - 정통 일본 요리',
      description:
        '시즌1 제2화 등장. 스미다구의 전통 일본 요리점. 제철 재료를 사용한 정갈한 일본 가정식을 맛볼 수 있다.',
      placeName: 'Sumire',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: 'せきざわ食堂 - 동네 식당의 정석',
      description:
        '시즌1 제3화 등장. 이타바시구의 오래된 동네 식당. 저렴하고 푸짐한 정식 메뉴가 인기인 서민적인 맛집.',
      placeName: 'せきざわ食堂',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: 'HIROKI 下北沢店 - 숨은 바 레스토랑',
      description:
        '시즌1 제4화 등장. 시모키타자와의 분위기 있는 바 레스토랑. 고로상이 혼자서도 편하게 술과 안주를 즐긴 곳.',
      placeName: 'HIROKI 下北沢店',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: 'カヤシマ - 전통 우동집',
      description:
        '시즌1 제5화 등장. 도시마구의 전통 우동 전문점. 수타 우동의 쫄깃한 식감과 진한 육수가 일품.',
      placeName: 'カヤシマ',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: 'とんかつ みやこや - 돈가스의 명가',
      description:
        '시즌1 제6화 등장. 이타바시구의 돈가스 전문점. 바삭한 튀김옷과 부드러운 고기가 조화를 이루는 정통 돈가스.',
      placeName: 'とんかつ みやこや',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: 'Fishing pond Musashino Gardens - 낚시터 레스토랑',
      description:
        '시즌1 제7화 등장. 미타카시의 독특한 낚시터 레스토랑. 직접 잡은 물고기를 요리해주는 특별한 경험.',
      placeName: 'Fishing pond Musashino Gardens',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: 'LocoDish - 하와이안 레스토랑',
      description:
        '시즌1 제8화 등장. 우라야스의 하와이안 레스토랑. 로코모코와 팬케이크 등 하와이 현지의 맛을 재현.',
      placeName: 'LocoDish',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: '中国家庭料理 楊 2号店 - 중화 가정식',
      description:
        '시즌1 제9화 등장. 이타바시구의 중국 가정식 레스토랑. 현지인이 운영하는 정통 중화요리를 맛볼 수 있다.',
      placeName: '中国家庭料理 楊 2号店',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: '和食亭 - 일본 가정식의 정수',
      description:
        '시즌1 제10화 등장. 이타바시구의 일본 가정식 전문점. 매일 바뀌는 일품요리와 정성스런 도시락이 인기.',
      placeName: '和食亭',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: 'Shiyousuke - 고급 일식당',
      description:
        '시즌1 제11화 등장. 미나토구의 고급 일식당. 제철 재료를 사용한 오마카세 코스가 유명한 곳.',
      placeName: 'Shiyousuke',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    {
      title: '야키니쿠 징기스칸 츠루야 - 양고기 전문점',
      description:
        '시즌1 제12화 등장. 요코하마의 징기스칸 전문점. 신선한 양고기를 철판에 구워먹는 홋카이도 스타일 요리.',
      placeName: '야키니쿠 징기스칸 츠루야',
      sunreiTitle: '고독한 미식가 시즌1',
      images: [],
    },
    // 고독한 미식가 시즌2 spots
    {
      title: 'お食事 樹 - 가정식 전문점',
      description:
        '시즌2 제1화 등장. 도시마구의 따뜻한 가정식 전문점. 고로상이 즐긴 일본식 정식이 인기메뉴.',
      placeName: 'お食事 樹',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: 'タイ国料理ライカノ - 태국 요리',
      description:
        '시즌2 제2화 등장. 아다치구의 정통 태국 요리점. 톰얌꿍과 팟타이 등 현지의 맛을 그대로 재현.',
      placeName: 'タイ国料理ライカノ',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: '田や - 소바 전문점',
      description:
        '시즌2 제3화 등장. 아다치구의 전통 소바집. 수타 소바와 함께 제공되는 계절 튀김이 일품.',
      placeName: '田や',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: '砂町銀座商店街 - 상점가 맛집',
      description:
        '시즌2 제4화 등장. 고토구의 활기찬 상점가. 다양한 길거리 음식과 전통 먹거리가 가득한 곳.',
      placeName: '砂町銀座商店街',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: 'Ōuchi - 일본 요리점',
      description:
        '시즌2 제5화 등장. 에도가와구의 고급 일본 요리점. 제철 재료를 사용한 가이세키 요리가 특징.',
      placeName: 'Ōuchi',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: 'つちや食堂 - 지역 맛집',
      description:
        '시즌2 제6화 등장. 치바현의 오래된 동네 식당. 지역 주민들이 사랑하는 저렴하고 푸짐한 정식.',
      placeName: 'つちや食堂',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: '珍々 - 중화요리',
      description:
        '시즌2 제7화 등장. 아다치구의 중화요리점. 볶음밥과 만두가 유명하며, 현지인들의 단골집.',
      placeName: '珍々',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: 'キッチン友 - 양식당',
      description:
        '시즌2 제8화 등장. 카나가와현의 레트로 양식당. 함박스테이크와 오므라이스가 인기 메뉴.',
      placeName: 'キッチン友',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: 'レストラン・ブラジル - 브라질 요리',
      description:
        '시즌2 제9화 등장. 토치기현의 브라질 레스토랑. 슈하스코와 페이조아다 등 본격 브라질 요리.',
      placeName: 'レストラン・ブラジル',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: '平和苑 - 야키니쿠',
      description:
        '시즌2 제10화 등장. 분쿄구의 고급 야키니쿠점. 최상급 와규를 사용한 프리미엄 구이 요리.',
      placeName: '平和苑',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: '三ちゃん食堂 - 서민 식당',
      description:
        '시즌2 제11화 등장. 오타구의 정겨운 서민 식당. 매일 바뀌는 일일 특선 메뉴가 인기.',
      placeName: '三ちゃん食堂',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    {
      title: 'なかやま - 스시집',
      description:
        '시즌2 제12화 등장. 에도가와구의 전통 스시집. 장인의 손맛이 느껴지는 에도마에 스시.',
      placeName: 'なかやま',
      sunreiTitle: '고독한 미식가 시즌2',
      images: [],
    },
    // 고독한 미식가 시즌3 spots
    {
      title: 'トリツバキ - 닭꼬치 전문점',
      description:
        '시즌3 제1화 등장. 스미다구의 닭꼬치 전문점. 숯불에 구운 다양한 부위의 야키토리가 일품.',
      placeName: 'トリツバキ',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: 'どん平 - 우동 전문점',
      description:
        '시즌3 제2화 등장. 아다치구의 전통 우동집. 쫄깃한 면발과 깊은 맛의 육수가 특징.',
      placeName: 'どん平',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: 'Parlour - 카페 레스토랑',
      description:
        '시즌3 제3화 등장. 이타바시구의 세련된 카페. 브런치와 디저트가 유명한 곳.',
      placeName: 'Parlour',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: 'ボラーチョ - 멕시칸 레스토랑',
      description:
        '시즌3 제4화 등장. 세타가야구의 정통 멕시칸 레스토랑. 타코와 부리토가 인기 메뉴.',
      placeName: 'ボラーチョ',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: '山源 - 산채 요리 전문점',
      description:
        '시즌3 제5화 등장. 이타바시구의 산채 요리 전문점. 제철 산나물을 사용한 건강식.',
      placeName: '山源',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: 'PAO Caravan Sarai - 중앙아시아 요리',
      description:
        '시즌3 제6화 등장. 분쿄구의 이색 레스토랑. 실크로드 지역의 다양한 요리를 맛볼 수 있다.',
      placeName: 'PAO Caravan Sarai',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: 'わさび園 かどや - 와사비 요리 전문점',
      description:
        '시즌3 제7화 등장. 시즈오카현의 와사비 농원 레스토랑. 신선한 와사비를 사용한 특별한 요리.',
      placeName: 'わさび園 かどや',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: 'Izakaya Restaurant - 이자카야',
      description:
        '시즌3 제8화 등장. 분쿄구의 전통 이자카야. 다양한 사케와 안주를 즐길 수 있는 곳.',
      placeName: 'Izakaya Restaurant',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: '第一亭 - 중화요리점',
      description:
        '시즌3 제9화 등장. 카나가와현의 오래된 중화요리점. 볶음밥과 라면이 특히 유명.',
      placeName: '第一亭',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: '川栄 - 일본 요리점',
      description:
        '시즌3 제10화 등장. 아다치구의 고급 일본 요리점. 제철 회와 정통 일본 요리.',
      placeName: '川栄',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: 'だるまや - 오뎅 전문점',
      description:
        '시즌3 제11화 등장. 오타구의 오뎅 전문점. 겨울철 따뜻한 오뎅과 사케가 어울리는 곳.',
      placeName: 'だるまや',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    {
      title: '峠の茶屋蔵 - 산속 찻집',
      description:
        '시즌3 제12화 등장. 니가타현 산속의 전통 찻집. 고로상이 여행 중 들른 특별한 휴식처.',
      placeName: '峠の茶屋蔵',
      sunreiTitle: '고독한 미식가 시즌3',
      images: [],
    },
    // 고독한 미식가 시즌4 spots
    {
      title: 'さいき - 가정식 전문점',
      description:
        '시즌4 제1화 등장. 아다치구의 따뜻한 가정식 전문점. 매일 바뀌는 정식 메뉴와 정성스런 반찬이 인기.',
      placeName: 'さいき',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: 'ティティ - 베트남 요리',
      description:
        '시즌4 제2화 등장. 시나가와구의 정통 베트남 레스토랑. 쌀국수 포와 생춘권 등 현지의 맛을 재현.',
      placeName: 'ティティ',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: 'アトム - 양식당',
      description:
        '시즌4 제3화 등장. 코토구의 레트로 양식당. 오므라이스와 함박스테이크가 명물인 추억의 맛집.',
      placeName: 'アトム',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: 'Teppan Chinese Shan Wei - 철판 중화요리',
      description:
        '시즌4 제4화 등장. 세타가야구의 독특한 철판 중화요리점. 눈앞에서 볶아주는 요리가 특징.',
      placeName: 'Teppan Chinese Shan Wei',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: "YO-HO's cafe Lanai - 하와이안 카페",
      description:
        '시즌4 제5화 등장. 치요다구의 하와이안 카페. 로코모코와 팬케이크 등 하와이 스타일 브런치.',
      placeName: "YO-HO's cafe Lanai",
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: '居酒屋まめぞ - 이자카야',
      description:
        '시즌4 제6화 등장. 세타가야구의 아늑한 이자카야. 제철 안주와 다양한 니혼슈가 매력적.',
      placeName: '居酒屋まめぞ',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: 'Kamarupuru - 네팔 요리',
      description:
        '시즌4 제7화 등장. 신주쿠구의 네팔 레스토랑. 커리와 모모(네팔 만두) 등 이국적인 맛.',
      placeName: 'Kamarupuru',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: '乙姫 - 일본 요리점',
      description:
        '시즌4 제8화 등장. 분쿄구의 고급 일본 요리점. 제철 재료를 사용한 정통 가이세키 요리.',
      placeName: '乙姫',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: '大幸園 - 중화요리',
      description:
        '시즌4 제9화 등장. 카와사키의 대중 중화요리점. 볶음밥과 만두가 유명한 현지인 맛집.',
      placeName: '大幸園',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: 'いろり家 - 숯불구이 전문점',
      description:
        '시즌4 제10화 등장. 타마시의 숯불구이 전문점. 이로리(일본식 화로)에서 구운 생선과 야채.',
      placeName: 'いろり家',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: 'Najimitei - 양식당',
      description:
        '시즌4 제11화 등장. 요코하마의 오래된 양식당. 나폴리탄과 크림 코로케가 인기 메뉴.',
      placeName: 'Najimitei',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
    {
      title: 'Miyuki Shokudō - 정식당',
      description:
        '시즌4 제12화 등장. 미나토구의 전통 정식당. 매일 바뀌는 일품요리와 정성스런 도시락.',
      placeName: 'Miyuki Shokudō',
      sunreiTitle: '고독한 미식가 시즌4',
      images: [],
    },
  ];

  const sunreiSpots = [];
  for (const data of spotsData) {
    const spot = sunreiSpotRepo.create({
      title: data.title,
      description: data.description,
      place: placeMap[data.placeName],
      sunrei: sunreiMap[data.sunreiTitle],
      images: data.images,
    });
    const savedSpot = await sunreiSpotRepo.save(spot);
    sunreiSpots.push(savedSpot);
  }
  console.log(`✅ Created ${sunreiSpots.length} SunreiSpot entries`);

  console.log('🎉 Mock data seeding completed!');
}
