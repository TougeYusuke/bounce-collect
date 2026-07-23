import { CONFIG } from './config';
import type { Segment, World } from './world';

/** 通ると玉が増える横バー。id は Ball.gateMask のビット位置 */
export interface Gate {
  id: number;
  x1: number;
  x2: number;
  y: number;
  multiplier: number;
}

/** 触れると上に打ち上げる横バー */
export interface Jumper {
  x1: number;
  x2: number;
  y: number;
  power: number;
}

export interface Stage {
  segments: Segment[];
  gates: Gate[];
  jumpers: Jumper[];
  /** この y より下に落ちた玉を回収してスコアにする */
  collectY: number;
}

export function stageToWorld(stage: Stage): World {
  return {
    width: CONFIG.BOARD_WIDTH,
    height: CONFIG.BOARD_HEIGHT,
    segments: stage.segments,
  };
}

/**
 * 手書きの固定ステージ1枚。
 *
 * 狙い: ジャンプ台を「上のゲート群の真下」に置くこと。
 * 打ち上げられた玉は gateMask が新品なので上のゲートをもう一度全部通れる
 * ＝ここが爆増の源になる（設計書 §2.2 / §2.4）。
 */
export function createFixedStage(): Stage {
  const w = CONFIG.BOARD_WIDTH;
  const h = CONFIG.BOARD_HEIGHT;

  return {
    segments: [
      // 中央の仕切り（玉を左右に散らす）
      { x1: w * 0.5, y1: 250, x2: w * 0.5, y2: 320 },
      // 斜めの誘導板（外側から中央へ流す）
      // ⚠️ 傾きを緩くしすぎない。玉が板の上に乗って眠り、そこで止まる。
      { x1: 0, y1: 386, x2: w * 0.32, y2: 468 },
      { x1: w, y1: 386, x2: w * 0.68, y2: 468 },
      // V字傾斜（下部・中央へ集める）
      // ⚠️ 中央を閉じないこと。閉じると玉が底で止まって回収ラインに届かず、
      //    ラウンドが永久に終わらなくなる。中央に隙間を空けて落とす。
      { x1: 0, y1: h - 150, x2: w * 0.42, y2: h - 70 },
      { x1: w, y1: h - 150, x2: w * 0.58, y2: h - 70 },
    ],
    gates: [
      { id: 0, x1: w * 0.05, x2: w * 0.35, y: 180, multiplier: 3 },
      { id: 1, x1: w * 0.4, x2: w * 0.6, y: 180, multiplier: 4 },
      { id: 2, x1: w * 0.65, x2: w * 0.95, y: 180, multiplier: 3 },
      { id: 3, x1: w * 0.08, x2: w * 0.42, y: 330, multiplier: 4 },
      { id: 4, x1: w * 0.58, x2: w * 0.92, y: 330, multiplier: 2 },
      { id: 5, x1: w * 0.35, x2: w * 0.65, y: 470, multiplier: 4 },
    ],
    jumpers: [
      { x1: w * 0.06, x2: w * 0.3, y: 520, power: CONFIG.JUMP_POWER },
      { x1: w * 0.7, x2: w * 0.94, y: 520, power: CONFIG.JUMP_POWER },
    ],
    collectY: h - 30, // V字の隙間より下。ここを越えた玉がスコアになる
  };
}
