import { CONFIG } from './config';
import { rangeInt } from './rng';
import type { StageDef } from './stageDef';

/**
 * ステージの「中身」を抽選する。**位置には触らない**。
 *
 * れいあの整理（2026-07-24）:
 *   - 位置（配置の型）はエディタで作る＝人が決める
 *   - 中身（ゲートの倍率・ジャンプ台の跳ね上限）は毎回の抽選＝機械が決める
 *
 * ⚠️ 元の `def` は書き換えない（毎回新しいオブジェクトを返す）。
 *    保存してある型を抽選が汚すと、次に開いた時に別のステージになってしまう。
 */

/** 5px刻みに乗せた乱数（手で置いた時と同じ見た目にするため・`EDITOR_GRID` と揃える） */
function snappedInt(rng: () => number, min: number, max: number): number {
  const g = CONFIG.EDITOR_GRID;
  return rangeInt(rng, Math.ceil(min / g), Math.floor(max / g)) * g;
}

/** 重み付きで倍率を1つ選ぶ */
function pickMultiplier(rng: () => number): number {
  const table = CONFIG.GATE_MULTIPLIER_TABLE;
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let r = rng() * total;
  for (const e of table) {
    r -= e.weight;
    if (r < 0) return e.value;
  }
  return table[table.length - 1].value;
}

/**
 * ジャンプ台を「最下段の1台だけ」に絞り、跳ね上限を抽選する。
 * ⚠️ 何台置いてあっても生き残るのは一番下の1台（同じ高さに並んでいたら先頭）。
 *    複数残すと跳ね上げ→再増殖が続いてラウンドが終わらない（2026-07-24 れいあ裁定）。
 */
function rollJumpers(jumpers: StageDef['jumpers'], rng: () => number): StageDef['jumpers'] {
  if (jumpers.length === 0) return [];
  let lowest = jumpers[0];
  for (const j of jumpers) if (j.y > lowest.y) lowest = j;
  const capacity = rangeInt(rng, CONFIG.JUMPER_CAPACITY_MIN, CONFIG.JUMPER_CAPACITY_MAX);

  // 位置を固定した台は保存されたまま（2026-07-27 れいあ要望）
  if (lowest.fixed) return [{ ...lowest, capacity }];

  /**
   * 位置を抽選する。
   * ⚠️ **幅は変えない**。実測で「壁に寄せると幅がそのまま当たりの広さになる」と分かって
   *    いるので、幅まで振ると型の性格ごと変わってしまう（`docs/stage-design.md`）。
   * ⚠️ y は帯の中（`JUMPER_ZONE_TOP`〜`JUMPER_ZONE_BOTTOM`）。下げすぎると漏斗に食い込む。
   */
  const width = lowest.x2 - lowest.x1;
  const x1 = snappedInt(rng, 0, Math.max(0, CONFIG.BOARD_WIDTH - width));
  const y = snappedInt(rng, CONFIG.JUMPER_ZONE_TOP, CONFIG.JUMPER_ZONE_BOTTOM);
  return [{ ...lowest, x1, x2: x1 + width, y, capacity }];
}

export function rollStage(def: StageDef, rng: () => number): StageDef {
  return {
    name: def.name,
    // ⚠️ `fixed` のゲートは抽選しない＝保存された倍率のまま（2026-07-27 れいあ要望）。
    //    ⚠️ 固定したゲートでは**PRNGを消費しない**。消費すると、固定を切り替えるだけで
    //       他のゲートの出方まで動いて「同じ種なのに別の盤面」になる。
    gates: def.gates.map((g) => (g.fixed ? { ...g } : { ...g, multiplier: pickMultiplier(rng) })),
    jumpers: rollJumpers(def.jumpers, rng),
    dividers: def.dividers.map((d) => ({ ...d })),
  };
}
