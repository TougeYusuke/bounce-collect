import { CONFIG } from './config';

export interface CupPoint {
  x: number;
  y: number;
}

/**
 * 上バケツを回す支点。画像の見た目上の中心を使う。
 * 胴の中心から口を固定しようとすると、大きく傾けた時に画像全体を持ち上げる補正が必要になるため、
 * 本体はこの支点のまわりにそのまま回す。
 */
export function cupTiltPivot(cupX: number, cupY: number): CupPoint {
  return {
    x: cupX + CONFIG.CUP_TILT_PIVOT_OFFSET_X,
    y: cupY + CONFIG.CUP_TILT_PIVOT_OFFSET_Y,
  };
}

/**
 * カップのローカル座標 → 世界座標。
 *
 * ローカル座標は「直立時の見た目そのまま」＝ `cupX` と `CONFIG.CUP_Y` からの相対で、
 * カップを傾けると中身ごと一緒に回る。-Y が口の向き、+X が**横倒し時に底になる面**。
 * Canvas の正の回転（時計回り）と同じ式にして、描画した口と物理の発生点をずらさない。
 */
export function cupLocalToWorld(cupX: number, tilt: number, lx: number, ly: number): CupPoint {
  const pivot = cupTiltPivot(cupX, CONFIG.CUP_Y);
  const dx = lx - CONFIG.CUP_TILT_PIVOT_OFFSET_X;
  const dy = ly - CONFIG.CUP_TILT_PIVOT_OFFSET_Y;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);

  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/**
 * 世界座標 → カップのローカル座標（`cupLocalToWorld` の逆）。
 * 「玉がカップのどのへんに居るか」を数値で見るために使う。
 * ⚠️ 見た目の判定はスクショではなくこの数値で行う（軌跡の方が軽くて確実・2026-07-25）。
 */
export function cupWorldToLocal(cupX: number, tilt: number, x: number, y: number): CupPoint {
  const pivot = cupTiltPivot(cupX, CONFIG.CUP_Y);
  const ux = x - pivot.x;
  const uy = y - pivot.y;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);

  return {
    x: ux * cos + uy * sin + CONFIG.CUP_TILT_PIVOT_OFFSET_X,
    y: -ux * sin + uy * cos + CONFIG.CUP_TILT_PIVOT_OFFSET_Y,
  };
}

/**
 * 傾いた上バケツの口（直立時は画像の口の中央）に対応する、次の玉の発生位置。
 * ⚠️ ここは**転がらない玉**（R2）の発生点。転がる玉は `cupRollStart` を使う。
 */
export function cupSpawnPosition(cupX: number, tilt: number): CupPoint {
  return cupLocalToWorld(cupX, tilt, CONFIG.CUP_SPAWN_OFFSET_X, CONFIG.CUP_SPAWN_OFFSET_Y);
}

/**
 * 「横倒しにした時に底になる面」を、口へ向かって進む向き（世界座標の単位ベクトル）。
 * カップのローカル -Y ＝ 口の向き。傾き 0 で真上、π で真下になる。
 */
export function cupPourDirection(tilt: number): CupPoint {
  return { x: Math.sin(tilt), y: -Math.cos(tilt) };
}

/** 底面の道の、転がり始めの位置（カップの奥＝バケツ画像に隠れる場所） */
export function cupRollStart(cupX: number, tilt: number): CupPoint {
  return cupLocalToWorld(cupX, tilt, CONFIG.CUP_ROLL_LANE_X, CONFIG.CUP_ROLL_START_Y);
}

/**
 * 玉が実際に落ち始める場所と、カップ中心とのズレ（約48px 右）。
 *
 * 🔑 **玉は口の縁から出るのでカップの中心には落ちない**。なぞった所に落とすには、
 *    この値ぶんカップを左へ寄せる（`setCupX`）。左端を狙うとカップは画面から見切れるが、
 *    **見切れてよい**（2026-07-25 れいあ裁定。左右で注ぐ向きを入れ替える案は
 *    「挙動が気持ち悪い」で不採用＝傾きは常に同じ向き）。
 * ⚠️ 傾き切った姿勢で計算する。途中の傾きで計算するとカップが横に泳ぐ。
 */
export function cupDropOffsetX(): number {
  return cupLocalToWorld(
    0,
    CONFIG.CUP_POUR_TILT,
    CONFIG.CUP_ROLL_LANE_X,
    CONFIG.CUP_ROLL_EXIT_Y,
  ).x;
}

/**
 * 底面の道を転がるフレーム数。
 * 🔑 距離（始まり→縁）÷ 速さ で**自動計算**する。距離とフレーム数を別々に持つと
 *    片方だけ変えた時に「縁より手前で落ちる／宙を滑る」が再発するため。
 */
export function cupRollFrames(speed: number = CONFIG.CUP_SPAWN_VX): number {
  const distance = CONFIG.CUP_ROLL_START_Y - CONFIG.CUP_ROLL_EXIT_Y;
  return Math.max(1, Math.round(distance / Math.max(0.01, speed)));
}
