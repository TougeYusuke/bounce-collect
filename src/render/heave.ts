import { CONFIG } from '../core/config';
import type { Gate } from '../core/stage';

/**
 * 玉が増えた瞬間、そのゲートの真上を**描画上だけ**持ち上げる量（px）＝「隆起」。
 *
 * 🔑 れいあが見たい「盛り上がり」＝**増えた瞬間に山がボコッと持ち上がる動き**（2026-07-26 判明）。
 *    それまで「盤面の密度」だと解釈していて**3回とも的が外れていた**。
 *
 * ⚠️ **物理では作れないことを実測で確認済み**（2026-07-26・4通り）:
 *    - 周りの玉に上向きの力を加える → 山は持ち上がらず（玉1個以上動いたのは 23% → 21% ＝改善なし）、
 *      **増殖だけ12倍に加速してラウンドが8分で終わらなくなった**
 *    - 盤面を満杯（95%）にしても同じ（頂上の変化の中央値 -0.7px）＝**密度の問題でもなかった**
 *    - 原因＝玉の重なりを位置で押し戻す方式は**力が遠くまで伝わらない**（隣を少し動かすだけ）
 *    → だから**見た目だけ動かす**。玉の回転を「当たり判定は円のまま」で解決したのと同じ考え方。
 *
 * ⚠️ **物理は1ミリも変わらない**＝ステージの採点にも当たり判定にも影響しない。
 *
 * 形＝ゲートの真上ほど高く、`GATE_HEAVE_VISUAL_RANGE` px 上で0。
 *     光り（`gate.flash`）が減るのに合わせて戻る＝「ボコッと上がってスッと戻る」。
 */
export function heaveLift(gates: readonly Gate[], x: number, y: number): number {
  const max = CONFIG.GATE_HEAVE_VISUAL;
  if (max <= 0) return 0;
  const range = CONFIG.GATE_HEAVE_VISUAL_RANGE;
  let lift = 0;
  for (const gate of gates) {
    if (x < gate.x1 || x > gate.x2) continue;
    const up = gate.y - y; // ゲートより上なら正
    if (up < 0 || up > range) continue;
    const t = (gate.flash ?? 0) / CONFIG.GATE_FLASH_FRAMES;
    const v = max * t * (1 - up / range);
    if (v > lift) lift = v;
  }
  return lift;
}
