export type TimelineStep = {
  id: string;
  time: string;
  title: string;
  duration: number;
  actualDurationMinutes?: number;
  note?: string;
  status: 'done' | 'current' | 'upcoming' | 'changed';
};

export const demoSchedule = {
  title: '서면 볼링장 친구 약속',
  date: '오늘, 7월 23일',
  appointmentTime: '14:00',
  destination: '서면 볼링장',
  prepStart: '12:55',
  departure: '13:32',
  arrival: '13:56',
  bufferMinutes: 4,
};

export const initialTimeline: TimelineStep[] = [
  { id: 'wash', time: '12:55', title: '세안', duration: 5, status: 'done' },
  { id: 'shower', time: '13:00', title: '샤워', duration: 15, status: 'current' },
  { id: 'makeup', time: '13:15', title: '화장', duration: 9, status: 'upcoming' },
  { id: 'dress', time: '13:24', title: '옷 입기', duration: 6, status: 'upcoming' },
  { id: 'bag', time: '13:30', title: '짐 챙기기', duration: 2, status: 'upcoming' },
  { id: 'depart', time: '13:32', title: '지하철로 출발', duration: 24, status: 'upcoming' },
  { id: 'arrive', time: '13:56', title: '도착 예정', duration: 0, status: 'upcoming' },
];

export const alternatives = [
  { id: 'subway', title: '지하철', arrival: '13:58', status: '정시 도착 가능', note: '가장 확실한 경로예요', cost: '1,550원', walk: '도보 7분', transfer: '환승 1회', durationMinutes: 24, distanceLabel: '약 8.4km', recommended: true, evidence: { kind: 'estimate', provider: 'ON_TIME_MODEL' } },
  { id: 'taxi', title: '택시', arrival: '13:49', status: '11분 여유', note: '가장 빠르게 도착해요', cost: '약 8,200원', walk: '도보 0분', transfer: '환승 없음', durationMinutes: 17, distanceLabel: '약 7.8km', recommended: false, evidence: { kind: 'estimate', provider: 'ON_TIME_MODEL' } },
  { id: 'bus', title: '다음 버스', arrival: '14:08', status: '8분 지각 예상', note: '비용은 낮지만 늦을 수 있어요', cost: '1,550원', walk: '도보 4분', transfer: '환승 없음', durationMinutes: 34, distanceLabel: '약 8.1km', recommended: false, evidence: { kind: 'estimate', provider: 'ON_TIME_MODEL' } },
] as const;
