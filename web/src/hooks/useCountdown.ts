import { useEffect, useState } from 'react';

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  totalMinutes: number;
  expired: boolean;
}

const split = (target: number, now: number): Countdown => {
  const totalMs = Math.max(0, target - now);
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs,
    totalMinutes: Math.floor(totalSeconds / 60),
    expired: totalMs <= 0,
  };
};

/** Live 1Hz countdown to an ISO timestamp. */
export function useCountdown(targetIso: string | undefined): Countdown {
  const target = targetIso ? Date.parse(targetIso) : Number.NaN;
  const [value, setValue] = useState<Countdown>(() => split(target, Date.now()));

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    setValue(split(target, Date.now()));
    const timer = window.setInterval(() => setValue(split(target, Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  return value;
}
