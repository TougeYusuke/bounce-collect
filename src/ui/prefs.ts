import { DEFAULT_PREFS, resolvePrefs, type SkinPrefs } from '../core/workshop';

/**
 * 見た目の好みの保存（ローカル完結）。
 * ⚠️ 読み出しは必ず `resolvePrefs` を通す（累計リセットで持っていないスキンが残るため）。
 */
const KEY = 'marble-mill.prefs';

export function loadPrefs(
  ownedBalls: string[],
  ownedThemes: string[],
  ownedBuckets: string[],
): SkinPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return resolvePrefs(raw ? JSON.parse(raw) : null, ownedBalls, ownedThemes, ownedBuckets);
  } catch {
    return resolvePrefs(DEFAULT_PREFS, ownedBalls, ownedThemes, ownedBuckets);
  }
}

export function savePrefs(p: SkinPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 保存できなくてもゲームは続ける
  }
}
