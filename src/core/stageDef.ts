import { CONFIG } from './config';
import type { Gate, Jumper, Stage, Wedge } from './stage';
import type { Segment } from './world';

/**
 * ステージの「編集できる部分」だけを持つ素のデータ（JSONにできる）。
 *
 * ⚠️ V字漏斗（角度・出口幅）はここに入れない。`CONFIG.FUNNEL_*` から毎回計算する
 *    **全ステージ共通の物理前提**なので、ステージごとに変えられるようにすると
 *    合格済みの手触りが型ごとにバラける。
 * ⚠️ id も持たせない。配列の並び順で振る（重複や飛びを持ち込ませないため）。
 */
export interface StageDef {
  name: string;
  gates: { x1: number; x2: number; y: number; multiplier: number }[];
  /** capacity を省くと CONFIG.JUMPER_CAPACITY（跳ね返せる玉の個数） */
  jumpers: { x1: number; x2: number; y: number; capacity?: number }[];
  dividers: { x1: number; y1: number; x2: number; y2: number }[];
}

/** gateMask / jumperMask が32bit整数なので、それぞれ32個まで */
const MAX_MASK_BITS = 32;

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
  // Wedge と Segment は同じ形なので、同じオブジェクトを両方に登録する。
  // ⚠️ 同じ参照であることが大事（放流で抜く時に両方から消せる）
  return { segments: [left, right], wedges: [left, right] };
}

/**
 * 素のデータから実行時のステージを組み立てる。
 * ⚠️ 毎回新しいオブジェクトを返すこと。使い回すと前のラウンドの状態が残る。
 */
export function buildStage(def: StageDef): Stage {
  if (def.gates.length > MAX_MASK_BITS) {
    throw new Error(`ゲートは${MAX_MASK_BITS}個までです（gateMaskが32bitのため）: ${def.gates.length}`);
  }
  if (def.jumpers.length > MAX_MASK_BITS) {
    throw new Error(
      `ジャンプ台は${MAX_MASK_BITS}個までです（jumperMaskが32bitのため）: ${def.jumpers.length}`,
    );
  }

  const funnel = buildFunnel();
  const gates: Gate[] = def.gates.map((g, i) => ({
    id: i,
    x1: g.x1,
    x2: g.x2,
    y: g.y,
    multiplier: g.multiplier,
  }));
  const jumpers: Jumper[] = def.jumpers.map((j, i) => ({
    id: i,
    x1: j.x1,
    x2: j.x2,
    y: j.y,
    power: CONFIG.JUMP_POWER, // ステージごとに変えない
    capacity: j.capacity ?? CONFIG.JUMPER_CAPACITY,
    used: 0,
  }));

  return {
    segments: [...def.dividers.map((d) => ({ ...d })), ...funnel.segments],
    wedges: funnel.wedges,
    gates,
    jumpers,
    collectY: CONFIG.BOARD_HEIGHT - 54, // 下バケツの口の中
    agitate: { x: CONFIG.BOARD_WIDTH / 2, y: CONFIG.BOARD_HEIGHT - CONFIG.FUNNEL_BOTTOM_MARGIN },
  };
}

/** 数値だけ受け取る（NaN・文字列・undefined は既定値に落とす） */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** 配列の中のオブジェクトだけ取り出す */
function objects(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
}

/**
 * 外から読み込んだ JSON を StageDef に整える。
 *
 * ⚠️ 保存ファイル（`src/stages/*.json`）は手で開いて直せる場所にあるので、
 *    項目が欠けていても**落とさずに空で埋める**。エディタが開けなくなる方が困る。
 */
export function normalizeStageDef(raw: unknown): StageDef {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'untitled';

  return {
    name,
    gates: objects(o.gates).map((g) => ({
      x1: num(g.x1),
      x2: num(g.x2, CONFIG.BOARD_WIDTH),
      y: num(g.y),
      multiplier: num(g.multiplier, 2),
    })),
    jumpers: objects(o.jumpers).map((j) => {
      const capacity = Math.round(num(j.capacity));
      // 0以下は「指定なし」＝CONFIG の既定値を使う（0で保存すると台が最初から死ぬ）
      return capacity > 0
        ? { x1: num(j.x1), x2: num(j.x2, CONFIG.BOARD_WIDTH), y: num(j.y), capacity }
        : { x1: num(j.x1), x2: num(j.x2, CONFIG.BOARD_WIDTH), y: num(j.y) };
    }),
    dividers: objects(o.dividers).map((d) => ({
      x1: num(d.x1),
      y1: num(d.y1),
      x2: num(d.x2),
      y2: num(d.y2),
    })),
  };
}

const W = CONFIG.BOARD_WIDTH;

/**
 * 既定のステージ。
 * 狙い: ジャンプ台を「上のゲート群の真下」に置くこと。
 * 打ち上げられた玉は gateMask が新品なので上のゲートをもう一度全部通れる
 * ＝ここが爆増の源になる（設計書 §2.2 / §2.4）。
 */
export const DEFAULT_STAGE_DEF: StageDef = {
  name: 'default',
  gates: [
    { x1: W * 0.05, x2: W * 0.35, y: 180, multiplier: 3 },
    { x1: W * 0.4, x2: W * 0.6, y: 180, multiplier: 4 },
    { x1: W * 0.65, x2: W * 0.95, y: 180, multiplier: 3 },
    { x1: W * 0.08, x2: W * 0.42, y: 330, multiplier: 4 },
    { x1: W * 0.58, x2: W * 0.92, y: 330, multiplier: 2 },
    { x1: W * 0.35, x2: W * 0.65, y: 470, multiplier: 4 },
  ],
  /**
   * ⚠️ **最下段に1台だけ**（2026-07-24 れいあ裁定。エディタも抽選も1台に絞る）。
   * ⚠️ 中央だけに置いてはいけない。中央には仕切り棒があって玉が左右へ散るので、
   *    真ん中は素通りゾーンになり**一度も乗らない**（実測：跳ね上限を変えても結果が不変・
   *    スコア48/玉43個でゲームが成立しなくなる）。だから1台でも**左右にまたがる幅**で置く。
   */
  jumpers: [{ x1: W * 0.06, x2: W * 0.94, y: 520 }],
  dividers: [{ x1: W * 0.5, y1: 250, x2: W * 0.5, y2: 320 }],
};
