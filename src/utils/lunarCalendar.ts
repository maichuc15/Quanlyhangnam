import {TimeUrgency} from '../types';

const VN_TZ_OFFSET_HOURS = 7;

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  isLeap: boolean;
}

/**
 * Returns today's date string (YYYY-MM-DD) in Asia/Ho_Chi_Minh timezone.
 */
export function getTodayISO(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const vn = new Date(utc + VN_TZ_OFFSET_HOURS * 3600000);
    const y = vn.getFullYear();
    const m = String(vn.getMonth() + 1).padStart(2, '0');
    const d = String(vn.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

export function addDaysToISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function parseISODate(isoDate: string): {year: number; month: number; day: number} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return {year, month, day};
}

/**
 * Parses DD/MM/YYYY (Vietnamese standard) or YYYY-MM-DD into YYYY-MM-DD.
 * Properly validates leap years (e.g. 29/02).
 */
export function parseVietnameseDateInput(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseISODate(trimmed) ? trimmed : null;
  }
  const match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return parseISODate(iso) ? iso : null;
}

export function formatDateVN(isoDate: string): string {
  const parsed = parseISODate(isoDate);
  if (!parsed) return isoDate;
  return `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}/${parsed.year}`;
}

export function formatShortDateVN(isoDate: string): string {
  const parsed = parseISODate(isoDate);
  if (!parsed) return isoDate;
  return `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}`;
}

export function getDaysDifference(targetISO: string, fromISO: string = getTodayISO()): number {
  const t = parseISODate(targetISO);
  const f = parseISODate(fromISO);
  if (!t || !f) return 0;
  const tUtc = Date.UTC(t.year, t.month - 1, t.day);
  const fUtc = Date.UTC(f.year, f.month - 1, f.day);
  return Math.round((tUtc - fUtc) / 86400000);
}

export function getTimeUrgency(daysUntil: number): TimeUrgency {
  if (daysUntil < 0) return TimeUrgency.PAST;
  if (daysUntil === 0) return TimeUrgency.TODAY;
  if (daysUntil <= 3) return TimeUrgency.SOON_1_3;
  if (daysUntil <= 7) return TimeUrgency.SOON_4_7;
  if (daysUntil <= 30) return TimeUrgency.UPCOMING_8_30;
  return TimeUrgency.LATER_30_PLUS;
}

export function formatDaysUntilLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Hôm nay';
  if (daysUntil === 1) return 'Ngày mai';
  if (daysUntil > 1) return `Còn ${daysUntil} ngày`;
  if (daysUntil === -1) return 'Hôm qua';
  return `Đã qua ${Math.abs(daysUntil)} ngày`;
}

export function formatVND(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  return `${sign}${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

export function formatShortVND(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const tr = abs / 1_000_000;
    const label = Number.isInteger(tr) ? String(tr) : tr.toFixed(1).replace('.', ',');
    return `${sign}${label}tr`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)}k`;
  }
  return `${sign}${abs}đ`;
}

export function parseVNDInput(raw: string): number {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!cleaned) return 0;
  if (cleaned.endsWith('tr')) {
    const val = parseFloat(cleaned.slice(0, -2).replace(',', '.'));
    return Number.isFinite(val) ? Math.max(0, Math.round(val * 1_000_000)) : 0;
  }
  if (cleaned.endsWith('k')) {
    const val = parseFloat(cleaned.slice(0, -1).replace(',', '.'));
    return Number.isFinite(val) ? Math.max(0, Math.round(val * 1_000)) : 0;
  }
  const digits = cleaned.replace(/[^\d]/g, '');
  if (!digits) return 0;
  const val = parseInt(digits, 10);
  return Number.isFinite(val) ? val : 0;
}

// ============================================================================
// Vietnamese Lunar Calendar Algorithm (Ho Ngoc Duc, Astronomical UTC+7)
// ============================================================================

const PI = Math.PI;

function INT(d: number): number {
  return Math.floor(d);
}

function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd =
    dd +
    INT((153 * m + 2) / 5) +
    365 * y +
    INT(y / 4) -
    INT(y / 100) +
    INT(y / 400) -
    32045;
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  }
  return jd;
}

function jdToDate(jd: number): {day: number; month: number; year: number} {
  let a: number;
  let b: number;
  let c: number;
  if (jd > 2299160) {
    a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT((1461 * d) / 4);
  const m = INT((5 * e + 2) / 153);
  const day = e - INT((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * INT(m / 10);
  const year = b * 100 + d - 4800 + INT(m / 10);
  return {day, month, year};
}

function newMoon(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 -= 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 -= 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 += 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  let deltat: number;
  if (T < -11) {
    deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
  } else {
    deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
  }
  return Jd1 + C1 - deltat;
}

function getNewMoonDay(k: number, timeZone: number): number {
  return INT(newMoon(k) + 0.5 + timeZone / 24);
}

function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L = L - PI * 2 * INT(L / (PI * 2));
  return L;
}

function getSunLongitude(dayNumber: number, timeZone: number): number {
  return INT((sunLongitude(dayNumber - 0.5 - timeZone / 24) / PI) * 6);
}

function getLunarMonth11(yy: number, timeZone: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  const sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone);
  }
  return nm;
}

function getLeapMonthOffset(a11: number, timeZone: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
}

/**
 * Converts a solar date (DD, MM, YYYY) to Vietnamese Lunar Date (UTC+7).
 */
export function convertSolarToLunar(
  dd: number,
  mm: number,
  yy: number,
  timeZone: number = VN_TZ_OFFSET_HOURS,
): LunarDate {
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone);
  }
  let a11 = getLunarMonth11(yy, timeZone);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = getLunarMonth11(yy - 1, timeZone);
  } else {
    lunarYear = yy + 1;
    b11 = getLunarMonth11(yy + 1, timeZone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let lunarLeap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) {
        lunarLeap = true;
      }
    }
  }
  if (lunarMonth > 12) {
    lunarMonth -= 12;
  }
  if (lunarMonth >= 11 && diff < 4) {
    lunarYear -= 1;
  }
  return {day: lunarDay, month: lunarMonth, year: lunarYear, isLeap: lunarLeap};
}

/**
 * Converts a Vietnamese Lunar Date back to Solar Date (YYYY-MM-DD).
 */
export function convertLunarToSolarISO(
  lunarDay: number,
  lunarMonth: number,
  lunarYear: number,
  lunarLeap: boolean = false,
  timeZone: number = VN_TZ_OFFSET_HOURS,
): string | null {
  let a11: number;
  let b11: number;
  if (lunarMonth < 11) {
    a11 = getLunarMonth11(lunarYear - 1, timeZone);
    b11 = getLunarMonth11(lunarYear, timeZone);
  } else {
    a11 = getLunarMonth11(lunarYear, timeZone);
    b11 = getLunarMonth11(lunarYear + 1, timeZone);
  }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11, timeZone);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (lunarLeap && lunarMonth !== leapMonth) {
      return null;
    } else if (lunarLeap || off >= leapOff) {
      off += 1;
    }
  }
  const monthStart = getNewMoonDay(k + off, timeZone);
  const {day, month, year} = jdToDate(monthStart + lunarDay - 1);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getLunarFromISO(isoDate: string): LunarDate | null {
  const parsed = parseISODate(isoDate);
  if (!parsed) return null;
  return convertSolarToLunar(parsed.day, parsed.month, parsed.year);
}

export function formatLunarShort(isoDate: string): string {
  const lunar = getLunarFromISO(isoDate);
  if (!lunar) return '';
  const dd = String(lunar.day).padStart(2, '0');
  const mm = String(lunar.month).padStart(2, '0');
  return `${dd}/${mm}${lunar.isLeap ? ' nhuận' : ''} ÂL`;
}

export function formatDualDate(isoDate: string): string {
  const solar = formatDateVN(isoDate);
  const lunar = formatLunarShort(isoDate);
  return lunar ? `${solar} (${lunar})` : solar;
}
