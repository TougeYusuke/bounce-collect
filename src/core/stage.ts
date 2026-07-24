import { CONFIG } from './config';
import type { Segment, World } from './world';

/**
 * 通ると玉が増える横バー。id は Ball.gateMask のビット位置。
 *
 * 「1つの玉につき1回だけ反応する」は `Ball.gateMask` が保証する。
 * ⚠️ 使用回数の上限（capacity）は**持たない**（2026-07-24 れいあ判断で撤去）。
 *    ジャンプ台と違って「何個まで反応させる」の仕組みは要らない、という整理。
 *    暴走の歯止めは MAX_BALLS（飽和したら玉を増やさず weight を掛ける）と
 *    ROUND_TIME_LIMIT、R2は RELEASE_SCORE での板抜きが担う。
 */
export interface Gate {
  id: number;
  x1: number;
  x2: number;
  y: number;
  multiplier: number;
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

/**
 * 中身の詰まった壁（台形）。(x1,y1)-(x2,y2) がその上面で、面より下は塞がっている。
 * x1 < x2 であること。
 */
export interface Wedge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Stage {
  segments: Segment[];
  gates: Gate[];
  jumpers: Jumper[];
  /** この y より下に落ちた玉を回収してスコアにする */
  collectY: number;
  /** 出口の位置。詰まり崩し（アジテータ）の中心。無いステージでは揺らさない */
  agitate?: { x: number; y: number };
  /**
   * 中身の詰まった壁。線分の衝突だけだと、山の圧力による位置補正が
   * 1フレームで線を押し越えて玉が壁の中へ抜ける（実測）。
   * ここに登録した面の下は「絶対に入れない領域」として毎フレーム締める。
   */
  wedges?: Wedge[];
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
function gate(id: number, x1: number, x2: number, y: number, multiplier: number): Gate {
  return { id, x1, x2, y, multiplier };
}

/**
 * V字の漏斗を作る。
 * ⚠️ 中央を閉じないこと。閉じると玉が底で止まって回収ラインに届かず、
 *    ラウンドが永久に終わらなくなる。出口を空けて落とす。
 *
 * 面は「見える線分（滑り応答用）」と「中身の詰まった壁（貫通の背止め）」の
 * 二重で表す。線分だけだと山の圧力で押し越えられる（実測）。
 */
function buildFunnel(): { segments: Segment[]; wedges: Wedge[] } {
  const w = CONFIG.BOARD_WIDTH;
  const h = CONFIG.BOARD_HEIGHT;
  const bottomY = h - CONFIG.FUNNEL_BOTTOM_MARGIN;
  const halfOutlet = CONFIG.BALL_RADIUS * CONFIG.OUTLET_BALLS;
  const run = w * 0.5 - halfOutlet; // 端から出口までの横の距離
  const rise = run * Math.tan((CONFIG.FUNNEL_ANGLE_DEG * Math.PI) / 180);
  // 盤面の上まで突き抜けないようにしておく
  const topY = Math.max(CONFIG.BALL_RADIUS * 6, bottomY - rise);
  const slope = (bottomY - topY) / run;

  // 斜面は盤面の外まで伸ばす（壁との角に玉が押し込まれた時、線分の端から
  // 下へ抜けるのを防ぐ）
  const over = CONFIG.BALL_RADIUS * 4;
  const left: Wedge = {
    x1: -over,
    y1: topY - over * slope,
    x2: w * 0.5 - halfOutlet,
    y2: bottomY,
  };
  const right: Wedge = {
    x1: w * 0.5 + halfOutlet,
    y1: bottomY,
    x2: w + over,
    y2: topY - over * slope,
  };
  return {
    segments: [left, right], // Wedge と Segment は同じ形なのでそのまま描ける
    wedges: [left, right],
  };
}

export function createFixedStage(): Stage {
  const w = CONFIG.BOARD_WIDTH;
  const h = CONFIG.BOARD_HEIGHT;
  const funnel = buildFunnel();

  return {
    segments: [
      // 中央の仕切り（玉を左右に散らす）
      { x1: w * 0.5, y1: 250, x2: w * 0.5, y2: 320 },
      // V字の漏斗。角度・出口幅は config のツマミで変えられる（§FUNNEL_*）
      ...funnel.segments,
    ],
    wedges: funnel.wedges,
    gates: [
      gate(0, w * 0.05, w * 0.35, 180, 3),
      gate(1, w * 0.4, w * 0.6, 180, 4),
      gate(2, w * 0.65, w * 0.95, 180, 3),
      gate(3, w * 0.08, w * 0.42, 330, 4),
      gate(4, w * 0.58, w * 0.92, 330, 2),
      gate(5, w * 0.35, w * 0.65, 470, 4),
    ],
    jumpers: [
      { id: 0, x1: w * 0.06, x2: w * 0.3, y: 520, power: CONFIG.JUMP_POWER },
      { id: 1, x1: w * 0.7, x2: w * 0.94, y: 520, power: CONFIG.JUMP_POWER },
    ],
    collectY: h - 54, // 下バケツの口の中。V字の出口(h-70)の16px下。ここを越えた玉がスコアになる
    agitate: { x: w / 2, y: h - CONFIG.FUNNEL_BOTTOM_MARGIN },
  };
}
