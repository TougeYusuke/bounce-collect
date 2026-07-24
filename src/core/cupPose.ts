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
 * 傾いた上バケツの口（直立時は画像の口の中央）に対応する、次の玉の発生位置。
 * Canvas の正の回転（時計回り）と同じ式にして、描画した口と物理の発生点をずらさない。
 */
export function cupSpawnPosition(cupX: number, tilt: number): CupPoint {
  const pivot = cupTiltPivot(cupX, CONFIG.CUP_Y);
  const dx = CONFIG.CUP_SPAWN_OFFSET_X - CONFIG.CUP_TILT_PIVOT_OFFSET_X;
  const dy = CONFIG.CUP_SPAWN_OFFSET_Y - CONFIG.CUP_TILT_PIVOT_OFFSET_Y;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);

  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}
