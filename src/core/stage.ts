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

/** 壁の厚み（玉の半径の何倍ぶん、裏側に線を重ねるか）。1本では圧力で貫通する */
const WALL_THICKNESS = 3;
/** 裏当ての線の間隔（玉の半径に対する割合）。詰めるほど貫通しにくい */
const WALL_LAYER_STEP = 0.5;

/**
 * 板に「本当の厚み」を持たせる。
 *
 * ⚠️ 線分1本だと、落下してくる玉は止められても、山になった玉が下から
 * 押し合う圧力にじわじわ押し越えられて、板の外側へ漏れる（れいあ指摘・実測で
 * 数百個が斜面の外に溜まった）。
 * 受け止める側（玉が来ない裏側）に、玉が越えられない厚みぶん平行線を重ねる。
 * 何個押し込まれても、必ずどれかの線に当たって内側へ戻される。
 */
function thickWall(x1: number, y1: number, x2: number, y2: number): Segment[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // 線分に垂直な単位ベクトル。受け止める側（下側 = ny>0）へ向ける
  let ux = -dy / len;
  let uy = dx / len;
  if (uy < 0) {
    ux = -ux;
    uy = -uy;
  }

  const out: Segment[] = [{ x1, y1, x2, y2 }]; // 表の1本だけ描く
  const step = CONFIG.BALL_RADIUS * WALL_LAYER_STEP;
  const layers = Math.ceil((CONFIG.BALL_RADIUS * WALL_THICKNESS) / step);
  for (let i = 1; i <= layers; i++) {
    const d = step * i;
    out.push({
      x1: x1 + ux * d,
      y1: y1 + uy * d,
      x2: x2 + ux * d,
      y2: y2 + uy * d,
      hidden: true, // 裏当ては描かない
    });
  }
  return out;
}

/**
 * V字の漏斗を作る。
 * ⚠️ 中央を閉じないこと。閉じると玉が底で止まって回収ラインに届かず、
 *    ラウンドが永久に終わらなくなる。出口を空けて落とす。
 */
function funnelWalls(): Segment[] {
  const w = CONFIG.BOARD_WIDTH;
  const h = CONFIG.BOARD_HEIGHT;
  const bottomY = h - CONFIG.FUNNEL_BOTTOM_MARGIN;
  const halfOutlet = CONFIG.BALL_RADIUS * CONFIG.OUTLET_BALLS;
  const run = w * 0.5 - halfOutlet; // 端から出口までの横の距離
  const rise = run * Math.tan((CONFIG.FUNNEL_ANGLE_DEG * Math.PI) / 180);
  // 盤面の上まで突き抜けないようにしておく
  const topY = Math.max(CONFIG.BALL_RADIUS * 6, bottomY - rise);
  const slope = (bottomY - topY) / run;

  // ⚠️ 斜面は盤面の外まで伸ばすこと。
  // 端を x=0 / x=w でぴったり止めると、壁と斜面の角に玉が押し込まれた時に
  // 線分の端から下へ抜けてしまい、V字の外側（斜面の裏）に玉が溜まる（実測）。
  const over = CONFIG.BALL_RADIUS * 4;
  return [
    ...thickWall(-over, topY - over * slope, w * 0.5 - halfOutlet, bottomY),
    ...thickWall(w + over, topY - over * slope, w * 0.5 + halfOutlet, bottomY),
  ];
}

export function createFixedStage(): Stage {
  const w = CONFIG.BOARD_WIDTH;
  const h = CONFIG.BOARD_HEIGHT;

  return {
    segments: [
      // 中央の仕切り（玉を左右に散らす）
      { x1: w * 0.5, y1: 250, x2: w * 0.5, y2: 320 },
      // V字の漏斗。角度・出口幅は config のツマミで変えられる（§FUNNEL_*）
      ...funnelWalls(),
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
