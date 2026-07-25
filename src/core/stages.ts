import { DEFAULT_STAGE_DEF, normalizeStageDef, type StageDef } from './stageDef';

/**
 * 遊べる「型」（配置）を全部集める。
 *
 * ⚠️ 読むのは **`src/stages/*.json`** ＝ステージエディタが書き出す場所。
 *    ここで読むことで、エディタで作った型が**そのまま製品にも入る**
 *    （保存の口は開発サーバー専用だが、出来上がった JSON はビルドに同梱される）。
 * ⚠️ 既定ステージは**常に混ぜる**。型を1つ保存した瞬間に、合格済みの配置で遊べなくなるのを防ぐ。
 */
const files = import.meta.glob<{ default: unknown }>('../stages/*.json', { eager: true });

export const STAGES: StageDef[] = [
  DEFAULT_STAGE_DEF,
  ...Object.keys(files)
    .sort() // ⚠️ 並び順を固定する。glob の順に頼ると環境で変わり、同じ種でも別の型になる
    .map((path) => normalizeStageDef(files[path].default)),
];

/**
 * 型を1つ選ぶ。
 * ⚠️ 選ぶだけ＝**配置は生成しない**（型は人が作る）。れいあの整理では
 *    ランダムなのは「①どの型か ②各ゲートの倍率 ③素材テーマ」の3つだけ。
 */
export function pickStageDef(rng: () => number, pool: StageDef[] = STAGES): StageDef {
  const list = pool.length > 0 ? pool : STAGES;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}
