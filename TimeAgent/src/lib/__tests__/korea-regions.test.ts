import { findKoreaRegion, KOREA_REGIONS, regionSpokenIn } from '../korea-regions';

describe('the regions someone can name', () => {
  it('covers all 17 시도 with distinct names and real coordinates', () => {
    expect(KOREA_REGIONS).toHaveLength(17);
    expect(new Set(KOREA_REGIONS.map((region) => region.name)).size).toBe(17);
    for (const { coordinate } of KOREA_REGIONS) {
      // Anywhere in South Korea, and nowhere near the (0, 0) a missing value would give.
      expect(coordinate.latitude).toBeGreaterThan(33);
      expect(coordinate.latitude).toBeLessThan(39);
      expect(coordinate.longitude).toBeGreaterThan(125);
      expect(coordinate.longitude).toBeLessThan(132);
    }
  });

  it('finds a region by the short name people actually say', () => {
    expect(findKoreaRegion('서울')?.coordinate.latitude).toBeCloseTo(37.5665, 3);
    expect(findKoreaRegion(' 대전 ')?.name).toBe('대전');
    expect(findKoreaRegion('서울특별시')).toBeNull();
  });
});

describe('a region said as part of the place', () => {
  it('reads the region and hands back the place without it', () => {
    // The region word has to come out of the query: left in, 서울 홍대입구역 returns a hotel called
    // 서울홍대 instead of the station.
    expect(regionSpokenIn('서울 홍대입구역')).toEqual({ region: expect.objectContaining({ name: '서울' }), placeName: '홍대입구역' });
    expect(regionSpokenIn('경기도 수원역')?.placeName).toBe('수원역');
    expect(regionSpokenIn('대전시 둔산동')?.placeName).toBe('둔산동');
  });

  it('leaves alone a name that merely starts with those syllables', () => {
    // 세종문화회관 is in Seoul and 광주요 is a shop. Reading a region off either sends the search
    // to the wrong province.
    expect(regionSpokenIn('세종문화회관')).toBeNull();
    expect(regionSpokenIn('광주요')).toBeNull();
    expect(regionSpokenIn('부산역')).toBeNull();
    expect(regionSpokenIn('제주도횟집')).toBeNull();
  });

  it('has nothing to read from a region with no place after it', () => {
    expect(regionSpokenIn('서울')).toBeNull();
    expect(regionSpokenIn('서울 ')).toBeNull();
    expect(regionSpokenIn('')).toBeNull();
  });
});
