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
  return [
    {
      ...lowest,
      capacity: rangeInt(rng, CONFIG.JUMPER_CAPACITY_MIN, CONFIG.JUMPER_CAPACITY_MAX),
    },
  ];
}

export function rollStage(def: StageDef, rng: () => number): StageDef {
  return {
    name: def.name,
    gates: def.gates.map((g) => ({ ...g, multiplier: pickMultiplier(rng) })),
    jumpers: rollJumpers(def.jumpers, rng),
    dividers: def.dividers.map((d) => ({ ...d })),
  };
}
