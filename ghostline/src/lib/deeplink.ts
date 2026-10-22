// Deep links: https://<your-site>/j/K7Q2FX opens Join with the code filled in.

/** Game-code alphabet: no O/0, no I/1, no L. */
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Returns the (cleaned, upper-cased) code from a /j/CODE path, or null. */
export function codeFromPath(path: string): string | null {
  const m = path.match(/^\/j\/([A-Za-z0-9]{1,6})\/?$/);
  if (!m) return null;
  return [...m[1].toUpperCase()].filter((c) => CODE_CHARS.includes(c)).join('');
}
