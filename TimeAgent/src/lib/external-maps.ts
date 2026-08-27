import { Coordinate } from '@/lib/journey';

/**
 * Handing the journey to a map app the person already trusts. This is the recovery action for
 * every state the providers cannot serve — realtime unsupported here, TMAP not answering, a
 * subway line with no live data — and the way to see the whole route rather than the summary.
 * Each app has a URL scheme for its installed app and a web address for when it is not installed.
 */
export type ExternalMapApp = 'naver' | 'kakao';
export type ExternalMapMode = 'transit' | 'walk' | 'car';

export type ExternalMapLinks = {
  app: ExternalMapApp;
  label: string;
  /** Opens the installed app; throws or does nothing when it is not installed. */
  appUrl: string;
  /** Always works in a browser. */
  webUrl: string;
};

export type ExternalMapRequest = {
  destination: Coordinate;
  destinationName: string;
  origin?: Coordinate | null;
  originName?: string;
  mode?: ExternalMapMode;
  /** The Android package / iOS bundle id NAVER asks callers to identify themselves with. */
  appName?: string;
};

const APP_NAME = 'com.timeagent.app';

function fixed(value: number) {
  return value.toFixed(6);
}

/** NAVER 지도: `nmap://route/{public|walk|car}` with dlat/dlng; slat/slng optional. */
export function naverMapLinks({ destination, destinationName, origin, originName, mode = 'transit', appName = APP_NAME }: ExternalMapRequest): ExternalMapLinks {
  const route = mode === 'transit' ? 'public' : mode === 'walk' ? 'walk' : 'car';
  const params = new URLSearchParams({
    dlat: fixed(destination.latitude),
    dlng: fixed(destination.longitude),
    dname: destinationName,
    appname: appName,
  });
  if (origin) {
    params.set('slat', fixed(origin.latitude));
    params.set('slng', fixed(origin.longitude));
    params.set('sname', originName || '현재 위치');
  }
  const query = params.toString();
  return {
    app: 'naver',
    label: '네이버 지도에서 보기',
    appUrl: `nmap://route/${route}?${query}`,
    // The web address is the same route request; the site offers the app store when it must.
    webUrl: `https://map.naver.com/p/directions/-/${encodeURIComponent(`${fixed(destination.longitude)},${fixed(destination.latitude)},${destinationName}`)}/-/${mode === 'transit' ? 'transit' : mode === 'walk' ? 'walk' : 'car'}`,
  };
}

/** 카카오맵: `kakaomap://route?ep=lat,lng&by=PUBLICTRANSIT|FOOT|CAR`; sp optional. */
export function kakaoMapLinks({ destination, destinationName, origin, mode = 'transit' }: ExternalMapRequest): ExternalMapLinks {
  const by = mode === 'transit' ? 'PUBLICTRANSIT' : mode === 'walk' ? 'FOOT' : 'CAR';
  const params = new URLSearchParams({ ep: `${fixed(destination.latitude)},${fixed(destination.longitude)}`, by });
  if (origin) params.set('sp', `${fixed(origin.latitude)},${fixed(origin.longitude)}`);
  return {
    app: 'kakao',
    label: '카카오맵에서 보기',
    appUrl: `kakaomap://route?${params.toString()}`,
    webUrl: `https://map.kakao.com/link/to/${encodeURIComponent(destinationName)},${fixed(destination.latitude)},${fixed(destination.longitude)}`,
  };
}

/** The apps offered on the plan screen: NAVER only, so one route button stands under the evidence. */
export function externalMapLinks(request: ExternalMapRequest): ExternalMapLinks[] {
  return [naverMapLinks(request)];
}

export type UrlOpener = (url: string) => Promise<unknown>;

/**
 * Opens the app when it is installed and the web page when it is not. Android 11+ refuses to say
 * whether a scheme is handled unless the manifest declares it, so this simply tries the app and
 * falls through on failure rather than asking first.
 */
export async function openExternalMap(links: ExternalMapLinks, open: UrlOpener): Promise<'app' | 'web' | 'failed'> {
  try {
    await open(links.appUrl);
    return 'app';
  } catch {
    try {
      await open(links.webUrl);
      return 'web';
    } catch {
      return 'failed';
    }
  }
}
