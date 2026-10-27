const formatters = {
  tokyo: new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }),
  ny: new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }),
};

export function marketClock(date: Date, city: 'tokyo' | 'ny') {
  const parts = Object.fromEntries(formatters[city].formatToParts(date).map(({ type, value }) => [type, value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = parts.weekday !== 'Sat' && parts.weekday !== 'Sun';
  let status = '時間外';
  if (weekday) {
    if (city === 'tokyo') {
      if ((minutes >= 540 && minutes < 690) || (minutes >= 750 && minutes < 930)) status = '取引中';
    } else if (minutes >= 240 && minutes < 570) status = 'プレ';
    else if (minutes >= 570 && minutes < 960) status = '取引中';
    else if (minutes >= 960 && minutes < 1200) status = 'アフター';
  }
  return { time: `${parts.hour}:${parts.minute}:${parts.second}`, status };
}

export function timeText(value?: string | null, full = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', ...(full ? { month: '2-digit', day: '2-digit' } as const : {}),
    hour: '2-digit', minute: '2-digit', ...(full ? {} : { second: '2-digit' } as const), hourCycle: 'h23',
  }).format(date);
}
