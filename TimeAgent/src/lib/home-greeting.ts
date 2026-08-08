function greetingForHour(hour: number) {
  if (hour < 6) return '좋은 새벽이에요';
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '좋은 오후예요';
  return '좋은 저녁이에요';
}

export function createHomeGreeting(now: Date, googleName?: string | null) {
  const name = homeDisplayName(googleName);
  const honorificName = name.endsWith('님') ? name : `${name}님`;
  return `${greetingForHour(now.getHours())}, ${honorificName}`;
}

export function homeDisplayName(googleName?: string | null) {
  const name = googleName?.trim().replace(/\s+/g, ' ') || '사용자';
  if (/^[A-Za-z][A-Za-z .'-]+$/.test(name) && name.includes(' ')) return name.split(' ')[0];
  return name;
}
