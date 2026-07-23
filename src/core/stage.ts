import { CONFIG } from './config';
import type { Segment, World } from './world';

/**
 * 通ると玉が増える横バー。id は Ball.gateMask のビット位置。
 *
 * ⚠️ capacity（使用回数の上限）が無いと増殖が永久に止まらない。
 * 盤面に玉が溜まると、その玉が何度でもゲートを通り続けて増え、
 * 回収と釣り合った平衡状態になってラウンドが終わらなくなる（実測）。
 * 使い切ったゲートは無効になり、色が変わる（本家も同じ挙動）。
 */
export interface Gate {
  id: number;
  x1: number;
  x2: number;
  y: number;
  multiplier: number;
  /** 通せる玉の総量（weight換算）。使い切ると無効になる */
  capacity: number;
  /** 使った量。capacity 以上で無効 */
  used: number;
}

export function isGateActive(gate: Gate): boolean {
  return gate.used < gate.capacity;
}

/**
 * 触れると上に打ち上げる横バー。
 * ゲートと同じく「1つの玉につき1回だけ」反応する（id は Ball.jumperMask のビット位置）。
 */
export interface Jumper {
  id: number;
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
function gate(
  id: number,
  x1: number,
  x2: number,
  y: number,
  multiplier: number,
  capacity: number,
): Gate {
  return {
    id,
    x1,
    x2,
    y,
    multiplier,
    capacity: capacity * CONFIG.GATE_CAPACITY_SCALE,
    used: 0,
  };
}

/**
 * 板に厚みを持たせる。
 *
 * ⚠️ 線分1本だと厚みがゼロなので、玉が密集して深くめり込んだ時に
 * 「最も近い点」が反対側になり、板の向こう側へ押し出されてしまう
 * （実測: V字の左右の端から玉が漏れ出た）。
 * 玉の直径ぶん離した平行線で挟めば、貫通しても必ずもう一方に当たって戻される。
 */
function thickWall(x1: number, y1: number, x2: number, y2: number): Segment[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // 線分に垂直な向きへ、玉の直径ぶんずらした線を足す
  let nx = (-dy / len) * CONFIG.BALL_RADIUS * 2;
  let ny = (dx / len) * CONFIG.BALL_RADIUS * 2;
  // 受け止める側（玉が来ない下側）に足す。上に足すと玉が乗る面がずれてしまう
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [
    { x1, y1, x2, y2 },
    { x1: x1 + nx, y1: y1 + ny, x2: x2 + nx, y2: y2 + ny },
  ];
}

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
      // 出口は玉2個ぶんに絞ってある。ここで詰まった玉が上へ押し返され、
      // 通ってきたゲートをもう一度くぐって増える——それがこのゲームの気持ちよさ。
      // 広げると流れきってしまい、狭めすぎると詰まったまま終わらなくなる。
      // ⚠️ 傾きは急に。緩いと玉が斜面の上で支え合って止まり、終わり際に居残る。
      ...thickWall(0, h - 250, w * 0.46, h - 70),
      ...thickWall(w, h - 250, w * 0.54, h - 70),
    ],
    gates: [
      gate(0, w * 0.05, w * 0.35, 180, 3, 40),
      gate(1, w * 0.4, w * 0.6, 180, 4, 40),
      gate(2, w * 0.65, w * 0.95, 180, 3, 40),
      gate(3, w * 0.08, w * 0.42, 330, 4, 90),
      gate(4, w * 0.58, w * 0.92, 330, 2, 90),
      gate(5, w * 0.35, w * 0.65, 470, 4, 150),
    ],
    jumpers: [
      { id: 0, x1: w * 0.06, x2: w * 0.3, y: 520, power: CONFIG.JUMP_POWER },
      { id: 1, x1: w * 0.7, x2: w * 0.94, y: 520, power: CONFIG.JUMP_POWER },
    ],
    collectY: h - 30, // V字の隙間より下。ここを越えた玉がスコアになる
  };
}
