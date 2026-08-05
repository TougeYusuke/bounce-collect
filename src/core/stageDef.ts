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
  /**
   * `fixed` ＝**倍率を固定する**（2026-07-27 れいあ要望）。
   * ⚠️ 省略・false なら**毎回抽選**される（`stageRoll.ts`）＝これまでの挙動。
   *    既存の型（`src/stages/*.json`）は誰も持っていないので、後方互換で全部抽選のまま。
   */
  gates: { x1: number; x2: number; y: number; multiplier: number; fixed?: boolean }[];
  /**
   * `capacity` を省くと CONFIG.JUMPER_CAPACITY（跳ね返せる玉の個数）。
   * `fixed` ＝**位置を固定する**（ゲートとは意味が違う＝あちらは倍率）。
   * ⚠️ 省略・false なら位置が毎回抽選される（幅は保ったまま・`JUMPER_ZONE_TOP` より下）。
   * ⚠️ 跳ね上限（capacity）は fixed に関わらず**常に抽選**（ラウンドの長さの主レバーなので、
   *    ここを固定できるようにすると型ごとに通し時間がバラける）。
   */
  jumpers: { x1: number; x2: number; y: number; capacity?: number; fixed?: boolean }[];
  dividers: { x1: number; y1: number; x2: number; y2: number }[];
}

/** gateMask / jumperMask が32bit整数なので、それぞれ32個まで */
const MAX_MASK_BITS = 32;

/**
 * ゲートの上限（2026-08-05 れいあ回答・理由なし）。**ステージ作成側の決まり**であって物理の制約ではない。
 *
 * ⚠️ 技術的な天井は `MAX_MASK_BITS`（32）で、これはそれとは**別の**設計上の上限。
 * ⚠️ ここが縛るのは「**作る側**」だけ＝エディタで足せる本数と、生成ツールが出す本数。
 *    `buildStage` は9本超えでも通す＝すでに9本を超えて保存された型（`stages:gen` が出した
 *    `type-09/33/34/66`＝11本）が**開けなく・遊べなくなるのを避ける**ため。
 */
export const MAX_GATES = 9;

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
      // ⚠️ true 以外（未指定・文字列・null）は全部 false ＝抽選。既存の型と同じ挙動を守る
      fixed: g.fixed === true,
    })),
    jumpers: objects(o.jumpers).map((j) => {
      const capacity = Math.round(num(j.capacity));
      const base = {
        x1: num(j.x1),
        x2: num(j.x2, CONFIG.BOARD_WIDTH),
        y: num(j.y),
        fixed: j.fixed === true,
      };
      // 0以下は「指定なし」＝CONFIG の既定値を使う（0で保存すると台が最初から死ぬ）
      return capacity > 0 ? { ...base, capacity } : base;
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
  /**
   * ⚠️ 段の高さは **300 / 410 / 520**（2026-07-25 れいあ指定・type-01 に揃える）。
   *    これより上へ戻さないこと。R2でバケツをひっくり返すと画像が y=192 まで下りてくるので、
   *    1段目が 200 より上だと**バケツと重なって**見える（れいあ指摘の違和感）。
   * 🔑 2026-07-25 に 255/375/500 から**下げた**。段が低いほど玉の山の中でゲートが発火し、
   *    増えた玉が下から押し上げて山が盛り上がる（実測: 押し上げ通過が約1.5倍）。
   * ⚠️ **これ以上下げないこと**。320/430/532 まで下げると type-04 が「詰まりっぱなしで
   *    終わらない」状態になった（盤面850・詰98%・通し480秒・30,010点）。崖は20pxしかない。。
   * ⚠️ 端は壁ぴったり（0 と W）。8px 空けていた頃は、壁に貼り付いて落ちる玉が
   *    ゲートの端をすり抜けて一度も増えなかった（実測: 右端に落とすと4点で終了）。
   */
  gates: [
    { x1: 0, x2: W * 0.35, y: 300, multiplier: 3 },
    { x1: W * 0.4, x2: W * 0.6, y: 300, multiplier: 4 },
    { x1: W * 0.65, x2: W, y: 300, multiplier: 3 },
    { x1: 0, x2: W * 0.42, y: 410, multiplier: 4 },
    { x1: W * 0.58, x2: W, y: 410, multiplier: 2 },
    // 最下段は「ジャンプ台｜ゲート」の横並び（下の jumpers と同じ y・重ねない）
    { x1: 178, x2: W, y: 520, multiplier: 4 },
  ],
  /**
   * ⚠️ **最下段のゲートの1つとして置く**（2026-07-25 れいあ指定）。
   *    最下段と同じ y に、ゲートと**横並び**にする（重ねない・1台だけ）。
   * ⚠️ 台の無いレーンが「狙いを外した時に伸びない場所」になる。
   *    ここを全部埋めると、どこに落としても同じ＝なぞって狙う意味が消える。
   */
  /**
   * ⚠️ **幅80**（2026-07-26 `stages:lane` の総当たりが選んだ）。
   *    🔑 170 だと**広すぎてどこに落としても拾ってしまい**、差が 1.8倍まで落ちていた。
   *    「幅では差がつかない」という以前の実測は**台を中央に置いた場合**の話で、
   *    壁に寄せた状態では**幅がそのまま「当たりの広さ」になる**。狭めると 141.4倍。
   */
  /**
   * ⚠️ `fixed: true`（位置を固定）を付けてある（2026-07-27）。位置抽選を入れた時に、
   *    **判定装置で合格させた型の前提が崩れるのを防ぐため**。壁寄せ＋幅80は
   *    `stages:lane` の総当たりが選んだ値で、位置が動くとこの調整が意味を失う。
   *    保存済みの14型も同じ理由で全部 `fixed: true` にしてある。
   *    ⚠️ 位置を毎回抽選させたい型では、エディタで固定を外す。
   */
  jumpers: [{ x1: 0, x2: 80, y: 520, fixed: true }],
  /**
   * 仕切りで囲った細い道（レーン）。ここへ落ちた玉はジャンプ台に触れずに流れる
   * ＝**狙いを外した時に伸びない場所**になる。
   * ⚠️ 片側を壁で代用しないこと。両側を仕切りで囲まないと差が出ない
   *    （実測: 囲い250〜330＝右を壁で代用 は 1.9倍止まり／囲い180〜260 は 16.9倍）。
   * ⚠️ 上端は 250 より下（R2でひっくり返したバケツに食い込ませない）。
   * ⚠️ 3本で**道が2本**できる（90〜210 と 210〜260）。真ん中に落とすと 20点で終わる＝狙いを外した形。
   */
  dividers: [
    { x1: 90, y1: 290, x2: 90, y2: 532 },
    { x1: 210, y1: 290, x2: 210, y2: 532 },
    { x1: 260, y1: 290, x2: 260, y2: 532 },
  ],
};
