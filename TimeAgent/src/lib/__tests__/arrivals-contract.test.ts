import {
  matchTagoStation,
  normalizeRouteName,
  normalizeStopName,
  normalizeTagoArrivals,
  normalizeTagoStations,
  tagoItems,
  tagoResultCode,
} from '../../../supabase/functions/mobility/arrivals-contract';

const near = { latitude: 35.152, longitude: 129.052 };

function tago(items: unknown, resultCode = '00') {
  return { response: { header: { resultCode, resultMsg: 'NORMAL SERVICE.' }, body: { items: { item: items }, numOfRows: 10, pageNo: 1, totalCount: Array.isArray(items) ? items.length : 1 } } };
}

describe('TAGO arrivals normalization', () => {
  it('reads one item and many items alike, and the result code from the header', () => {
    expect(tagoItems(tago({ nodeid: 'a' }))).toEqual([{ nodeid: 'a' }]);
    expect(tagoItems(tago([{ nodeid: 'a' }, { nodeid: 'b' }]))).toHaveLength(2);
    expect(tagoItems({ response: { body: { items: '' } } })).toEqual([]);
    expect(tagoResultCode(tago([], '22'))).toBe('22');
    expect(tagoResultCode(null)).toBe('');
  });

  it('lists nearby stops with their distance from the boarding coordinate', () => {
    const stations = normalizeTagoStations(tago([
      { citycode: 26, nodeid: 'BSB1001', nodenm: '서면 정류장', gpslati: 35.1521, gpslong: 129.0521 },
      { citycode: 26, nodeid: 'BSB1002', nodenm: '서면역', gpslati: 35.157, gpslong: 129.059 },
      { citycode: 26, nodenm: '이름만' },
    ]), near);
    expect(stations).toHaveLength(2);
    expect(stations[0]).toMatchObject({ nodeId: 'BSB1001', cityCode: '26', name: '서면 정류장' });
    expect(stations[0].distanceMeters).toBeLessThan(20);
    expect(stations[1].distanceMeters).toBeGreaterThan(500);
  });

  it('matches the TMAP stop by name within 300 m, a stranger only when on top of the point, and never a far namesake', () => {
    const stations = normalizeTagoStations(tago([
      { citycode: 26, nodeid: 'far', nodenm: '서면 정류장', gpslati: 35.16, gpslong: 129.06 },
      { citycode: 26, nodeid: 'near-other', nodenm: '부전시장', gpslati: 35.1521, gpslong: 129.0521 },
      { citycode: 26, nodeid: 'exact', nodenm: '서면정류장(중)', gpslati: 35.1525, gpslong: 129.0525 },
    ]), near);
    expect(matchTagoStation(stations, '서면 정류장')?.nodeId).toBe('exact');
    // Nothing is named like the boarding stop: only a stop practically on the point is trusted.
    expect(matchTagoStation(stations, '전혀 다른 이름')?.nodeId).toBe('near-other');
    expect(matchTagoStation(stations.filter((station) => station.nodeId !== 'near-other'), '전혀 다른 이름')).toBeNull();
    // A stop with the right name a kilometre away is a different stop, not this one.
    expect(matchTagoStation(stations.filter((station) => station.nodeId === 'far'), '서면 정류장')).toBeNull();
    // 120 m away with a different name is too far to trust without the name.
    const offset = normalizeTagoStations(tago([{ citycode: 26, nodeid: 'off', nodenm: '다른곳', gpslati: 35.1531, gpslong: 129.052 }]), near);
    expect(offset[0].distanceMeters).toBeGreaterThan(100);
    expect(matchTagoStation(offset, '서면 정류장')).toBeNull();
    expect(matchTagoStation([], '서면 정류장')).toBeNull();
  });

  it('keeps only the arrivals for the route the person will board, soonest first', () => {
    const arrivals = normalizeTagoArrivals(tago([
      { routeno: '101', arrtime: 420, arrprevstationcnt: 3, vehicletp: '저상버스' },
      { routeno: '101번', arrtime: 60, arrprevstationcnt: 1 },
      { routeno: '5-1', arrtime: 30 },
      { routeno: '101', arrtime: 'soon' },
    ]), { routeName: '101', checkedAt: '2026-08-26T09:00:00.000Z' });
    expect(arrivals).toEqual([
      { routeName: '101번', arrivalInSeconds: 60, expectedAt: '2026-08-26T09:01:00.000Z', stopsAway: 1 },
      { routeName: '101', arrivalInSeconds: 420, expectedAt: '2026-08-26T09:07:00.000Z', stopsAway: 3, vehicleType: '저상버스' },
    ]);
  });

  it('normalizes the spellings providers disagree on', () => {
    expect(normalizeStopName('서면역 (중)')).toBe(normalizeStopName('서면'));
    expect(normalizeStopName('해운대 정류장')).toBe(normalizeStopName('해운대정류소'));
    expect(normalizeRouteName('101번')).toBe(normalizeRouteName('101'));
    expect(normalizeRouteName('급행 1001')).toBe('급행1001');
  });
});
