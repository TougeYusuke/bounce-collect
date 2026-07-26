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

/**
 * 速さ（1× / 2× / 4×）の保持（2026-07-26 れいあ要望「毎回設定するのは面倒」）。
 *
 * ⚠️ スキンの好み（上の `KEY`）とは**別のキー**にする。工房で累計をリセットした時、
 *    スキンだけ最初に戻って速さは残るのが自然なため。
 */
const SPEED_KEY = 'marble-mill.speed';

/**
 * 覚えている速さ。⚠️ `allowed` に無い値なら `fallback` に落とす。
 *    0.5倍は `?debug=1` の時だけ出るので、そのまま普通に開くと
 *    「ボタンを押しても切り替わらない」状態になる（一覧に無い値からは次へ進めない）。
 */
export function loadSpeed(allowed: number[], fallback: number): number {
  try {
    const raw = localStorage.getItem(SPEED_KEY);
    const v = raw === null ? NaN : Number(raw);
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveSpeed(v: number): void {
  try {
    localStorage.setItem(SPEED_KEY, String(v));
  } catch {
    // 保存できなくてもゲームは続ける
  }
}

/**
 * 「盤面をどれだけ満杯に保つか」の実験用プリセット（`?debug=1` の時だけ切り替わる）。
 * ⚠️ 選定が終わったら `supplyPreset.ts` ごと消す（実験の足場）。
 */
const SUPPLY_KEY = 'marble-mill.supply';

export function loadSupplyKey(): string | null {
  try {
    return localStorage.getItem(SUPPLY_KEY);
  } catch {
    return null;
  }
}

export function saveSupplyKey(key: string): void {
  try {
    localStorage.setItem(SUPPLY_KEY, key);
  } catch {
    // 保存できなくてもゲームは続ける
  }
}
