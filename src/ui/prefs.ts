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
 * 「自分の型だけで遊ぶ」の保持（2026-07-27 れいあ要望）。
 *
 * ⚠️ スキンの好み（上の `KEY`）とは**別のキー**にする。あちらは `resolvePrefs` で
 *    「持っていないスキンを落とす」解決を通す入れ物なので、無関係な設定を混ぜると
 *    解決処理の対象が増えて壊れやすくなる。速さを別キーにしてあるのと同じ理由。
 * ⚠️ 既定は **false（既定の型と混ぜる）**。自作が0個の時に効かせると遊べる型が
 *    ゼロになるので、効かせる側（`main.ts` の `unlocked()`）で個数も見ること。
 */
const MINE_ONLY_KEY = 'marble-mill.mineonly';

export function loadMineOnly(): boolean {
  try {
    return localStorage.getItem(MINE_ONLY_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMineOnly(on: boolean): void {
  try {
    localStorage.setItem(MINE_ONLY_KEY, on ? '1' : '0');
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
 * 音量（0〜1）。⚠️ **0 がミュート**＝ミュートの真偽値を別に持たない
 *    （2つ持つと「ミュート解除したのに音量0で鳴らない」が起きる）。
 * ⚠️ スキン・速さとは別のキー（片方を消してももう片方が残るのが自然）。
 */
const VOLUME_KEY = 'marble-mill.volume';

export function loadVolume(fallback = 0.6): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
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
