import { CONFIG } from './config';
import { DEFAULT_STAGE_DEF, buildStage } from './stageDef';
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
  /**
   * 増やした直後の光り残り（フレーム）。描画がこれを見て帯とラベルを大きく光らせる。
   * ⚠️ 本家は増えた瞬間に倍率のラベルがポップする。これが無いと、玉の山に埋まった時に
   *    「いま増えている」が画面に一切出ない（2026-07-25 れいあの参考動画で判明）。
   */
  flash?: number;
}

/**
 * 触れると上に打ち上げる横バー。
 * ゲートと同じく「1つの玉につき1回だけ」反応する（id は Ball.jumperMask のビット位置）。
 *
 * ⚠️ ゲートと違い、**台ごとに「何個の玉を跳ね返せるか」の上限を持つ**（2026-07-24 れいあ判断）。
 *    これが無いと跳ね上げ→再増殖のループが長く続き、ラウンドがいつまでも終わらない。
 */
export interface Jumper {
  id: number;
  x1: number;
  x2: number;
  y: number;
  power: number;
  /** この台が跳ね返せる玉の個数。使い切ると反応しなくなる */
  capacity: number;
  /** これまでに跳ね返した玉の個数 */
  used: number;
}

/** まだ跳ね返せるか（使い切っていないか） */
export function isJumperActive(j: Jumper): boolean {
  return j.used < j.capacity;
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
 * 既定ステージ。中身は `stageDef.ts`（JSONにできる素のデータ）が正本で、
 * ここはそれを組み立てて返すだけの薄い入口。
 * ⚠️ 毎回組み立て直すこと。使い回すと前のラウンドの状態が残る。
 */
export function createFixedStage(): Stage {
  return buildStage(DEFAULT_STAGE_DEF);
}
