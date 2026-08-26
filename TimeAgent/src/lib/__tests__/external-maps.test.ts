import { externalMapLinks, kakaoMapLinks, naverMapLinks, openExternalMap } from '@/lib/external-maps';

const request = {
  destination: { latitude: 35.1631234, longitude: 129.1635678 },
  destinationName: '해운대 해수욕장',
  origin: { latitude: 35.1531, longitude: 129.0597 },
};

describe('handing the journey to an external map', () => {
  it('builds NAVER app and web links for a transit route with both ends', () => {
    const links = naverMapLinks(request);
    const url = new URL(links.appUrl);
    expect(url.protocol).toBe('nmap:');
    expect(links.appUrl.startsWith('nmap://route/public?')).toBe(true);
    expect(url.searchParams.get('dlat')).toBe('35.163123');
    expect(url.searchParams.get('dlng')).toBe('129.163568');
    expect(url.searchParams.get('dname')).toBe('해운대 해수욕장');
    expect(url.searchParams.get('slat')).toBe('35.153100');
    expect(url.searchParams.get('appname')).toBe('com.timeagent.app');
    expect(links.webUrl.startsWith('https://map.naver.com/')).toBe(true);
    expect(naverMapLinks({ ...request, origin: null, mode: 'walk' }).appUrl).toMatch(/^nmap:\/\/route\/walk\?/);
    expect(naverMapLinks({ ...request, origin: null }).appUrl).not.toContain('slat');
  });

  it('builds 카카오맵 app and web links', () => {
    const links = kakaoMapLinks(request);
    expect(links.appUrl).toBe('kakaomap://route?ep=35.163123%2C129.163568&by=PUBLICTRANSIT&sp=35.153100%2C129.059700');
    expect(links.webUrl).toBe(`https://map.kakao.com/link/to/${encodeURIComponent('해운대 해수욕장')},35.163123,129.163568`);
    expect(kakaoMapLinks({ ...request, mode: 'car' }).appUrl).toContain('by=CAR');
  });

  it('offers both apps, labelled', () => {
    expect(externalMapLinks(request).map((links) => links.label)).toEqual(['네이버 지도에서 보기', '카카오맵에서 보기']);
  });

  it('opens the app when it is installed and the web page when it is not', async () => {
    const links = kakaoMapLinks(request);
    const installed = jest.fn(async () => true);
    expect(await openExternalMap(links, installed)).toBe('app');
    expect(installed).toHaveBeenCalledWith(links.appUrl);

    const missing = jest.fn(async (url: string) => {
      if (url.startsWith('kakaomap://')) throw new Error('no activity');
      return true;
    });
    expect(await openExternalMap(links, missing)).toBe('web');
    expect(missing).toHaveBeenLastCalledWith(links.webUrl);

    const broken = jest.fn(async () => { throw new Error('nothing'); });
    expect(await openExternalMap(links, broken)).toBe('failed');
  });
});
