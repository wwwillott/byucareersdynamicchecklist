import { DateTime } from 'luxon';

export const MOUNTAIN_TZ = 'America/Denver';

export function mountainDateKey(now = DateTime.now()): string {
  return now.setZone(MOUNTAIN_TZ).toFormat('yyyy-LL-dd');
}

export function formatMountainDate(dateKey: string): string {
  return DateTime.fromFormat(dateKey, 'yyyy-LL-dd', { zone: MOUNTAIN_TZ }).toFormat('cccc, LLL dd');
}

export function yesterdayMountainDateKey(now = DateTime.now()): string {
  return now.setZone(MOUNTAIN_TZ).minus({ days: 1 }).toFormat('yyyy-LL-dd');
}

export type ShiftKey = 'morning' | 'afternoon' | 'evening';

export const SHIFT_ORDER: Record<ShiftKey, number> = {
  morning: 1,
  afternoon: 2,
  evening: 3
};

export function currentMountainShift(now = DateTime.now()): ShiftKey {
  const hour = now.setZone(MOUNTAIN_TZ).hour;

  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

export function shiftLabel(shift: ShiftKey): string {
  return shift[0].toUpperCase() + shift.slice(1);
}
