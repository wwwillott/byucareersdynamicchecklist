import { DateTime } from 'luxon';

export const MOUNTAIN_TZ = 'America/Denver';

export function mountainDateKey(now = DateTime.now()): string {
  return now.setZone(MOUNTAIN_TZ).toFormat('yyyy-LL-dd');
}

export function formatMountainDate(dateKey: string): string {
  return DateTime.fromFormat(dateKey, 'yyyy-LL-dd', { zone: MOUNTAIN_TZ }).toFormat('cccc, LLL dd');
}

export function yesterdayMountainDateKey(now = DateTime.now()): string {
  const zoned = now.setZone(MOUNTAIN_TZ);
  const weekday = zoned.weekday;
  const daysToSubtract = weekday === 1 ? 3 : weekday === 7 ? 2 : 1;
  return zoned.minus({ days: daysToSubtract }).toFormat('yyyy-LL-dd');
}

export function isMountainWeekend(now = DateTime.now()): boolean {
  const weekday = now.setZone(MOUNTAIN_TZ).weekday;
  return weekday === 6 || weekday === 7;
}

export function isMountainFriday(now = DateTime.now()): boolean {
  return now.setZone(MOUNTAIN_TZ).weekday === 5;
}

export function nextBusinessDateKey(now = DateTime.now()): string {
  const zoned = now.setZone(MOUNTAIN_TZ);
  const weekday = zoned.weekday;
  const daysToAdd = weekday === 5 ? 3 : weekday === 6 ? 2 : 1;
  return zoned.plus({ days: daysToAdd }).toFormat('yyyy-LL-dd');
}

export function nextBusinessWeekday(now = DateTime.now()): string {
  const zoned = now.setZone(MOUNTAIN_TZ);
  const weekday = zoned.weekday;
  const daysToAdd = weekday === 5 ? 3 : weekday === 6 ? 2 : 1;
  return zoned.plus({ days: daysToAdd }).toFormat('cccc');
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
  if (hour >= 12 && hour < 14) return 'afternoon';
  return 'evening';
}

export function shiftLabel(shift: ShiftKey): string {
  return shift[0].toUpperCase() + shift.slice(1);
}
