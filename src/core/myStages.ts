import { normalizeStageDef, type StageDef } from './stageDef';

/**
 * プレイヤーが自分で作った／リンクでもらった型の置き場（2026-07-27）。
 *
 * ⚠️ リアが量産して**製品に同梱する型**は `src/stages/*.json`（開発サーバーの口で保存）で
 *    別系統。こちらは**プレイヤーの端末の中だけ**にあるもの。混ぜて考えないこと。
 * ⚠️ 読む時は必ず `normalizeStageDef` を通す（項目が欠けていても工房が開けなくなるのを防ぐ
 *    既存の防波堤）。リンクで外から来たものもここに入るので、素通しにしてはいけない。
 * 🔑 抽選に混ぜるのは `myStageDefs()`。**解放テーブルの判定は通さない**
 *    （自分で作ったものに鍵をかける意味がない・`main.ts` の `unlocked()` 参照）。
 */
export interface MyStage {
  def: StageDef;
  /** 出どころ。'me'＝自分で作った ／ 'link'＝リンクでもらった（一覧に印を出す） */
  from: 'me' | 'link';
  /** 保存した時刻（ISO文字列）。一覧の並びに使う */
  savedAt: string;
}

const KEY = 'marble-mill.mystages';

/**
 * 持てる型の数。
 * ⚠️ 超えた時は**黙って捨てない**（古いものを勝手に消すと、作った型が消えた事故に見える）。
 *    保存を失敗として返し、「どれか消してね」と促す側の責任にする。
 */
export const MY_STAGE_MAX = 20;

export function loadMyStages(): MyStage[] {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    // 壊れたJSONは空として扱う（工房が開けなくなる方が困る）
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({
      def: normalizeStageDef(x.def),
      from: x.from === 'link' ? 'link' : 'me',
      savedAt: typeof x.savedAt === 'string' ? x.savedAt : '',
    }));
}

function write(list: MyStage[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** 同じ名前が既にある時、末尾に連番を足して空いている名前を作る */
function freeName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const name = `${base} (${i})`;
    if (!taken.has(name)) return name;
  }
  return `${base} (99)`;
}

/**
 * 型を保存する。
 * - 同じ出どころの同名 → **上書き**（型を直して保存し直す動き）。⚠️ 上限に達していても通す
 * - 出どころが違う同名 → **名前をずらして両方残す**（もらった型が自作を消すと取り返せない）
 * - それ以外で上限に達していたら `{ ok: false, reason: 'full' }`
 */
export function saveMyStage(
  def: StageDef,
  from: 'me' | 'link',
): { ok: true; name: string } | { ok: false; reason: 'full' } {
  const list = loadMyStages();
  const now = new Date().toISOString();

  const sameIndex = list.findIndex((s) => s.def.name === def.name && s.from === from);
  if (sameIndex >= 0) {
    list[sameIndex] = { def, from, savedAt: now };
    write(list);
    return { ok: true, name: def.name };
  }

  if (list.length >= MY_STAGE_MAX) return { ok: false, reason: 'full' };

  const name = freeName(def.name, new Set(list.map((s) => s.def.name)));
  list.push({ def: { ...def, name }, from, savedAt: now });
  write(list);
  return { ok: true, name };
}

export function removeMyStage(name: string): void {
  write(loadMyStages().filter((s) => s.def.name !== name));
}

/** 抽選に混ぜる用。StageDef だけ取り出す */
export function myStageDefs(): StageDef[] {
  return loadMyStages().map((s) => s.def);
}
