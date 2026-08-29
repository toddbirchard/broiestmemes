/**
 * Filename -> human title/slug. Shared by the pipeline (which bakes results into
 * the manifest) and the site (for category titles).
 *
 * Context: 1,510 of 1,902 filenames in the bucket carry real meaning via `_`
 * separators or camelCase (`aislop_lofiBeats_cripplingDepression.jpg`), and
 * usually redundantly repeat their category as a prefix. The other ~21% are junk
 * (`giphy-3.gif`, `200.gif`, hex hashes). The junk path matters: an honest
 * `atcSNOt` is better than an invented "17 #4".
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "is",
  "nor",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
]);

/** Words that should stay upper-case when they survive camelCase splitting. */
const ACRONYMS = new Set([
  "ai",
  "amc",
  "ar15",
  "bbc",
  "bmo",
  "dj",
  "eu",
  "fbi",
  "gif",
  "hd",
  "id",
  "jd",
  "mlb",
  "nba",
  "nfl",
  "nsfw",
  "nyc",
  "ok",
  "pc",
  "ps5",
  "rip",
  "suv",
  "tv",
  "uk",
  "us",
  "usa",
  "wtf",
  "xl",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip a trailing file extension. Conservative: 2-5 alphanumerics only. */
export function stripExtension(filename: string): string {
  return filename.replace(/\.[a-z0-9]{2,5}$/i, "");
}

/**
 * True when a candidate title carries no information and we should fall back to
 * the raw filename rather than dress it up.
 */
function isJunk(words: string): boolean {
  const s = words.trim();
  if (s.length < 3) return true;
  if (/^\d+$/.test(s)) return true;
  if (/^[0-9a-f]{8,}$/i.test(s.replace(/\s+/g, ""))) return true;
  if (
    /^(giphy|tenor|img|image|images|unnamed|download|screenshot|source|photo|untitled)[\s\-_\d]*$/i.test(
      s
    )
  ) {
    return true;
  }
  const digits = (s.match(/\d/g) ?? []).length;
  if (digits / s.length > 0.6) return true;
  return false;
}

function titleCaseWord(word: string, isFirst: boolean): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  if (!isFirst && STOPWORDS.has(lower)) return lower;
  // Preserve deliberate internal capitals (e.g. "McDonalds", "JD").
  if (/[A-Z]/.test(word.slice(1))) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * `aislop`, `aislop_lofiBeats_cripplingDepression.jpg` -> "Lofi Beats Crippling Depression"
 * `really`, `really_JDPower.jpg`                       -> "JD Power"
 * `benny`, `200.gif`                                   -> "200"           (junk, kept raw)
 */
export function prettifyTitle(category: string, filename: string): string {
  const base = stripExtension(filename);

  // Filenames usually repeat their category ("dearbrough/dearbrough_ahhhh.jpg").
  // Only strip it if something survives — `bro/bro.jpg` must not become "".
  const deprefixed = base.replace(new RegExp(`^${escapeRe(category)}[_\\-\\s.]*`, "i"), "");
  const source = deprefixed.length >= 2 ? deprefixed : base;

  const words = source
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // lofiBeats -> lofi Beats
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // JDPower  -> JD Power
    // 49years -> 49 years, but leave dimension notation (1024x819) intact.
    .replace(/(\d)(?!x\d)([a-zA-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (isJunk(words)) return base;

  return words
    .split(" ")
    .map((w, i) => titleCaseWord(w, i === 0))
    .join(" ");
}

/** Category name -> display title. Category names are single lowercase tokens. */
export function categoryTitle(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words
    .split(" ")
    .map((w, i) => titleCaseWord(w, i === 0))
    .join(" ");
}

/**
 * URL-safe slug. Result is stored in the manifest so URLs never move.
 *
 * The category is stripped when the filename redundantly repeats it, so
 * `gerald/gerald_birthday.gif` becomes `/gerald/birthday` rather than
 * `/gerald/gerald-birthday`. Any collisions this introduces are resolved by
 * assignSlugs().
 */
export function slugify(filename: string, category?: string): string {
  let base = stripExtension(filename);
  if (category) {
    const deprefixed = base.replace(new RegExp(`^${escapeRe(category)}[_\\-\\s.]*`, "i"), "");
    if (deprefixed.length >= 2) base = deprefixed;
  }
  const slug = base
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "item";
}

/**
 * Assign unique slugs within a category.
 *
 * Necessary because `a_b.gif` and `a_b.png` both slugify to `a-b`, and because
 * slugify() strips characters that distinguish otherwise-different filenames.
 * Inputs are sorted by object name first so the winner is stable across runs —
 * without that, which file keeps the clean slug could change between pipeline
 * runs and silently break existing URLs.
 */
export function assignSlugs(filenames: string[], category?: string): Map<string, string> {
  const sorted = [...filenames].sort();
  const taken = new Set<string>();
  const out = new Map<string, string>();

  for (const filename of sorted) {
    const base = slugify(filename, category);
    let slug = base;
    if (taken.has(slug)) {
      // Deterministic suffix from the filename itself, not a counter, so adding
      // an unrelated file later never renumbers an existing entry.
      let hash = 0;
      for (let i = 0; i < filename.length; i++) {
        hash = (hash * 31 + filename.charCodeAt(i)) >>> 0;
      }
      slug = `${base}-${hash.toString(36).slice(0, 6)}`;
      let n = 2;
      while (taken.has(slug)) slug = `${base}-${hash.toString(36).slice(0, 6)}-${n++}`;
    }
    taken.add(slug);
    out.set(filename, slug);
  }
  return out;
}
