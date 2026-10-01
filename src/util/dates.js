/**
 * Date utilities. All internal dates are ISO 'YYYY-MM-DD' strings in the
 * Gregorian calendar, treated as *calendar dates* with no timezone.
 *
 * NOTE ON THE NEPALI (B.S.) CALENDAR — see ASSUMPTIONS.md.
 * A full B.S. <-> A.D. conversion depends on a lunar/solar table that changes
 * yearly and is published by the Nepali government. Rather than ship an
 * unverified table (which would silently produce wrong dates), this app is
 * A.D.-native and stores the B.S. deadline label as editable text. The B.S.
 * label helper below is a *display aid only* and is clearly marked as such.
 */

const MS_DAY = 86400000;

export function todayISO() {
  return toISO(new Date());
}

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * A real, existing calendar date in `YYYY-MM-DD` form.
 *
 * A bare shape regex is not enough: `2027-13-45` matches `\d{4}-\d{2}-\d{2}`
 * but is not a date, and `new Date(2027, 12, 45)` silently rolls over into
 * January. Every place that accepts a user-typed or imported date string must
 * use this instead, or bad input is stored as if it were real.
 */
export function isValidISODate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(fromISO, toISOStr) {
  const a = parseISO(fromISO).getTime();
  const b = parseISO(toISOStr).getTime();
  return Math.round((b - a) / MS_DAY);
}

/** Inclusive list of ISO dates from start to end. */
export function dateRange(startISO, endISO) {
  const out = [];
  const n = diffDays(startISO, endISO);
  for (let i = 0; i <= n; i++) out.push(addDays(startISO, i));
  return out;
}

export function clampISO(iso, loISO, hiISO) {
  if (diffDays(loISO, iso) < 0) return loISO;
  if (diffDays(iso, hiISO) < 0) return hiISO;
  return iso;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Calendar grids start on Monday, so the header must be in Monday-first order.
// Rendering DOW as-is would shift every column label by one day.
const DOW_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function dow(iso) {
  return parseISO(iso).getDay();
}

export function isWeekend(iso) {
  const d = dow(iso);
  return d === 0 || d === 6;
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (opts.short) return `${d.getDate()} ${MONTH[d.getMonth()]}`;
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateLong(iso) {
  if (!iso) return '—';
  return fmtDate(iso);
}

export function relDayLabel(iso, ref = todayISO()) {
  const d = diffDays(ref, iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 0) return `in ${d} days`;
  return `${-d} days ago`;
}

/** '2027-04-13' -> '12 Chaitra 2083 BS' (DISPLAY AID ONLY — see note above). */
export const BS_MONTHS = [
  'Baishakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
];

/**
 * Approximate Bikram Sambat year for a Gregorian year.
 * A.D. 2027 falls in B.S. 2083. This is a coarse, display-only mapping that
 * assumes the Nepali new year falls in mid-April. It is intentionally NOT a
 * date converter — only ever used to render the editable deadline label.
 */
export function approxBSYear(adYear) {
  return adYear + (adYear >= 2026 ? 56 : 57);
}

/** Human "time left" phrase for a day count. */
export function humanDays(n) {
  if (n === 0) return 'today';
  if (n > 0) return `${n} day${n === 1 ? '' : 's'} left`;
  return `${-n} day${n === -1 ? '' : 's'} overdue`;
}

/** 95 -> '1h 35m'. */
export function fmtMinutes(min) {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

/** 95 -> '1:35' for stopwatch display. */
export function clock(minutes) {
  const m = Math.max(0, Math.round(minutes || 0));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export function fmtSeconds(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export { DOW, DOW_MON_FIRST, MONTH };
