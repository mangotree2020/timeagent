import { WeatherIcon } from './weather';

export function shouldAnimateHomeLogo({
  delayMinutes,
  weatherIcon,
  weatherStatus,
  calendarStatus,
}: {
  delayMinutes: number;
  weatherIcon?: WeatherIcon | null;
  weatherStatus: string;
  calendarStatus: string;
}) {
  return delayMinutes > 0
    || weatherIcon === 'rain'
    || weatherIcon === 'snow'
    || weatherIcon === 'storm'
    || weatherStatus === 'error'
    || calendarStatus === 'error';
}
