// Unsaved work kept on this device, per signed-in user, so it survives a
// reload, an app update or the end of a 2-hour session. Never shared between
// users of the same device. Old entries are dropped after a week.

const PREFIX = 'kbs.draft:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredDraft<T> {
  savedAt: number;
  value: T;
}

const storage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

export const draftKey = (uid: string, ...parts: Array<string | number | null | undefined>) =>
  `${PREFIX}${uid}:${parts.map(p => (p === null || p === undefined ? '' : String(p))).join('|')}`;

export function readDraft<T>(key: string, now = Date.now()): StoredDraft<T> | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredDraft<T>;
    if (!d || typeof d.savedAt !== 'number' || now - d.savedAt > MAX_AGE_MS) { s.removeItem(key); return null; }
    return d;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T, now = Date.now()) {
  try { storage()?.setItem(key, JSON.stringify({ savedAt: now, value })); } catch { /* full or blocked */ }
}

export function clearDraft(key: string) {
  try { storage()?.removeItem(key); } catch { /* ignore */ }
}
