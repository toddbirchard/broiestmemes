/** Compact byte sizes for the metadata rails: 1.8 GB, 132 MB, 44 KB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Short relative time for the metadata rails: "3d", "8mo", "6y".
 *
 * Deliberately terse — this sits inline in a mono rail next to a count and a
 * byte size, where "3 days ago" would dominate the line. The full timestamp is
 * always available in the surrounding <time> element's title/dateTime.
 */
export function formatAge(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const delta = Math.max(0, now - then);

  if (delta < HOUR) {
    const m = Math.floor(delta / MINUTE);
    return m <= 1 ? "just now" : `${m}m`;
  }
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  const days = Math.floor(delta / DAY);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** Anything added in the last 30 days earns the amber NEW dot. */
export function isRecent(iso: string, now: number = Date.now()): boolean {
  const then = Date.parse(iso);
  return !Number.isNaN(then) && now - then < 30 * DAY;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Year range for a category, collapsing to a single year when they match. */
export function formatSpan(oldest: string, newest: string): string {
  const a = new Date(oldest).getFullYear();
  const b = new Date(newest).getFullYear();
  if (Number.isNaN(a) || Number.isNaN(b)) return "";
  return a === b ? `${a}` : `${a}–${b}`;
}
