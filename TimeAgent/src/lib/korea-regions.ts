import type { Coordinate } from './journey';

/**
 * Place search is anchored to where the person is standing, which is right for the appointment they
 * are most likely making and wrong for every other one: 홍대입구역 asked from Busan comes back an
 * error, and 강남역 comes back as a 강남 restaurant down the road. The place exists — the search
 * never reached it.
 *
 * These are the anchors that reach the rest of it. Each 시도 gets asked at once when nothing near
 * the person answered, and one of them is read straight out of the spoken name when they had
 * already said where — which is the anchor moved without a question being put to anyone.
 */
export type KoreaRegion = {
  /** The short form people say, not the administrative one. */
  name: string;
  /** Where a search is anchored from — a well-known centre, not a centroid. */
  coordinate: Coordinate;
};

/** The 17 시도, in the order Koreans are used to seeing them listed. */
export const KOREA_REGIONS: readonly KoreaRegion[] = [
  { name: '서울', coordinate: { latitude: 37.5665, longitude: 126.9780 } },
  { name: '경기', coordinate: { latitude: 37.2750, longitude: 127.0090 } },
  { name: '인천', coordinate: { latitude: 37.4563, longitude: 126.7052 } },
  { name: '강원', coordinate: { latitude: 37.8813, longitude: 127.7300 } },
  { name: '충북', coordinate: { latitude: 36.6357, longitude: 127.4917 } },
  { name: '충남', coordinate: { latitude: 36.6588, longitude: 126.6728 } },
  { name: '대전', coordinate: { latitude: 36.3504, longitude: 127.3845 } },
  { name: '세종', coordinate: { latitude: 36.4800, longitude: 127.2890 } },
  { name: '전북', coordinate: { latitude: 35.8242, longitude: 127.1480 } },
  { name: '전남', coordinate: { latitude: 34.8161, longitude: 126.4630 } },
  { name: '광주', coordinate: { latitude: 35.1595, longitude: 126.8526 } },
  { name: '경북', coordinate: { latitude: 36.5760, longitude: 128.5056 } },
  { name: '대구', coordinate: { latitude: 35.8714, longitude: 128.6014 } },
  { name: '경남', coordinate: { latitude: 35.2372, longitude: 128.6923 } },
  { name: '부산', coordinate: { latitude: 35.1796, longitude: 129.0756 } },
  { name: '울산', coordinate: { latitude: 35.5384, longitude: 129.3114 } },
  { name: '제주', coordinate: { latitude: 33.4996, longitude: 126.5312 } },
];

/**
 * A region the person already named while speaking. Saying 서울 홍대입구역 answers the question before
 * it is asked, so the app anchors there and keeps quiet.
 *
 * The region has to stand as its own word: 세종문화회관 is in Seoul and 광주요 is a shop, and reading
 * a region off the front of either would anchor the search in the wrong province. Names that merely
 * begin with those syllables are left alone, and the app asks like it would for any other name.
 */
export function regionSpokenIn(placeName: string): { region: KoreaRegion; placeName: string } | null {
  const spoken = placeName.trim();
  for (const region of KOREA_REGIONS) {
    const match = spoken.match(new RegExp(`^${region.name}(?:특별자치시|특별자치도|특별시|광역시|시|도)?\\s+(.+)$`));
    if (match) return { region, placeName: match[1].trim() };
  }
  return null;
}
