import type { BallSkin } from './theme';

/**
 * 玉1個の絵。
 *
 * 🔑 **実物と工房のプレビューで同じ関数を使う**（2026-07-25）。別々に描いていると、
 *    スキンを足したときにプレビューだけ古い見た目のまま残る。
 * ⚠️ **当たり判定は常に半径 r の円**（れいあ指定「当たり判定は今のままでいい」）。
 *    ここで星や角丸を描いても物理は円のまま＝見た目だけの話。
 */

/** 玉ごとの色。マーブル（複数色）は玉の番号で振り分ける */
export function skinColors(skin: BallSkin, variant: number): { hi: string; mid: string; lo: string } {
  const p = skin.palette;
  if (!p || p.length === 0) return { hi: skin.hi, mid: skin.mid, lo: skin.lo };
  return p[((variant % p.length) + p.length) % p.length];
}

/** 何種類の絵を焼けばよいか（マーブルは色数ぶん） */
export function skinVariants(skin: BallSkin): number {
  return Math.max(1, skin.palette?.length ?? 1);
}

/**
 * 見た目の半径（当たり判定の半径 × スキンの倍率）。
 * ⚠️ 焼くキャンバスの大きさもこれで決めること。当たり判定の半径で余白を取ると絵が切れる。
 */
export function visualRadius(skin: BallSkin, collisionRadius: number): number {
  return collisionRadius * (skin.scale ?? 1);
}

/**
 * 回転を何段階に分けて焼くか（2026-07-25 れいあ要望「星とかだと動かないのは違和感」）。
 *
 * 🔑 **玉ごとに `ctx.rotate` はしない**。800個ぶんの座標変換を毎フレーム走らせると重い
 *    （残像を1本のパスにまとめたのと同じ理由）。角度ごとに焼いておいて、絵を選ぶだけにする。
 * ⚠️ 焼く枚数 = 色数 × ここ。増やすとメモリも焼き時間も比例して増える（五色の星で 5×24＝120枚）。
 *
 * **24 の根拠（実測）**: 玉の回転は中央値 3.2度/フレーム。
 *   - 12段（30度刻み）だと 9.4フレーム＝156ms に1回パッと飛ぶ＝カクついて見える
 *   - 24段（15度刻み）だと 4.7フレーム＝78ms ＝切り替わりに気づかない
 *   ⚠️ 上げすぎ厳禁ではないが、1フレームで飛ぶのは最大2段（上限速度6.4/半径8＝45.8度）なので
 *      **これ以上細かくしても見た目は変わらない**（焼く枚数だけ増える）。
 */
export const SPIN_STEPS = 24;

/**
 * 回しても見た目が変わるか。
 * ⚠️ **円＋模様なしは回しても同じ絵**なので焼かない（ビー玉が枚数を12倍持つのは無駄）。
 * ⚠️ 野球ボールは**円でも回す**（縫い目が回る）。
 * ⚠️ 金貨は同心円の模様なので回しても変わらない＝回さない。
 */
export function spinsVisibly(skin: BallSkin): boolean {
  if (skin.shape && skin.shape !== 'circle') return true;
  return skin.pattern === 'baseball';
}

/** そのスキンで焼く角度の枚数（回らないものは1枚） */
export function spinSteps(skin: BallSkin): number {
  return spinsVisibly(skin) ? SPIN_STEPS : 1;
}

/** 回転角（ラジアン）から何枚目の絵を使うか。負の角度でも 0〜steps-1 に収める */
export function spinIndex(spin: number, steps: number): number {
  if (steps <= 1) return 0;
  const i = Math.round((spin / (Math.PI * 2)) * steps);
  return ((i % steps) + steps) % steps;
}

/** 星（5角）の輪郭。⚠️ 外接半径を r に合わせるので、円と同じ大きさに見える */
function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const inner = r * 0.46;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : inner;
    // 上を尖らせる（-90度から始める）
    const a = (Math.PI * i) / 5 - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** 角丸の四角（squircle 風）。丸っこいけど円ではない形 */
function squirclePath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const s = r * 0.86;
  const k = s * 0.62;
  g.beginPath();
  g.moveTo(cx - s + k, cy - s);
  g.arcTo(cx + s, cy - s, cx + s, cy + s, k);
  g.arcTo(cx + s, cy + s, cx - s, cy + s, k);
  g.arcTo(cx - s, cy + s, cx - s, cy - s, k);
  g.arcTo(cx - s, cy - s, cx + s, cy - s, k);
  g.closePath();
}

/** ハート。⚠️ 外接を r に収める（円の玉と大きさが揃う） */
function heartPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const s = r * 0.95;
  g.beginPath();
  g.moveTo(cx, cy + s * 0.92);
  g.bezierCurveTo(cx - s * 1.5, cy - s * 0.2, cx - s * 0.55, cy - s * 1.25, cx, cy - s * 0.42);
  g.bezierCurveTo(cx + s * 0.55, cy - s * 1.25, cx + s * 1.5, cy - s * 0.2, cx, cy + s * 0.92);
  g.closePath();
}

/** 六角（尖った角が上下） */
function hexPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * i) / 3 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/**
 * 中心のまわりに回す。
 * ⚠️ パスを組む**前**に掛けること（Canvas のパスは組んだ時点の変換で座標が確定する）。
 */
function rotateAround(g: CanvasRenderingContext2D, cx: number, cy: number, angle: number): void {
  g.translate(cx, cy);
  g.rotate(angle);
  g.translate(-cx, -cy);
}

function shapePath(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  skin: BallSkin,
  angle = 0,
): void {
  // 円は回しても同じ形なので変換を掛けない（毎回の save/restore を省く）
  const spun = angle !== 0 && !!skin.shape && skin.shape !== 'circle';
  if (spun) {
    g.save();
    rotateAround(g, cx, cy, angle);
  }
  if (skin.shape === 'star') starPath(g, cx, cy, r);
  else if (skin.shape === 'squircle') squirclePath(g, cx, cy, r);
  else if (skin.shape === 'heart') heartPath(g, cx, cy, r);
  else if (skin.shape === 'hex') hexPath(g, cx, cy, r);
  else {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
  }
  if (spun) g.restore();
}

/** コインの縁と中央の窪み。平べったい金属に見せる */
function coinFace(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, edge: string): void {
  g.save();
  g.strokeStyle = edge;
  g.lineWidth = Math.max(1, r * 0.16);
  g.beginPath();
  g.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = Math.max(1, r * 0.1);
  g.beginPath();
  g.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** 野球ボールの赤い縫い目（左右に弧を2本） */
function stitches(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, r * 0.14);
  g.lineCap = 'round';
  for (const dir of [-1, 1]) {
    g.beginPath();
    g.arc(cx + dir * r * 1.05, cy, r * 0.95, dir < 0 ? -0.9 : Math.PI - 0.9, dir < 0 ? 0.9 : Math.PI + 0.9);
    g.stroke();
  }
  g.restore();
}

/**
 * 玉を1個描く。`variant` はマーブルの色の振り分けに使う（玉の番号を渡す）。
 * ⚠️ 落ち影も含めて描くので、呼ぶ側は右下に余白を取ること。
 *
 * `angle` は見た目の回転（ラジアン）。
 * 🔑 **回すのは形と模様だけ。光り方は回さない**（光源は動かないので、
 *    ハイライトごと回すと玉ではなく世界が回って見える）。
 */
export function drawBall(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  skin: BallSkin,
  variant = 0,
  withShadow = true,
  angle = 0,
): void {
  const c = skinColors(skin, variant);

  if (withShadow) {
    g.save();
    g.fillStyle = 'rgba(0,0,0,.30)';
    shapePath(g, cx + r * 0.22, cy + r * 0.3, r, skin, angle);
    g.fill();
    g.restore();
  }

  const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, c.hi);
  grad.addColorStop(0.62, c.mid);
  grad.addColorStop(1, c.lo);
  g.fillStyle = grad;
  shapePath(g, cx, cy, r, skin, angle);
  g.fill();

  if (skin.pattern === 'coin') {
    // ⚠️ 同心円なので模様自体は回さない（回しても同じ絵）。形の回転にだけ従わせる
    g.save();
    shapePath(g, cx, cy, r, skin, angle);
    g.clip();
    coinFace(g, cx, cy, r, skin.accent ?? '#8a6420');
    g.restore();
  }

  if (skin.pattern === 'baseball') {
    // 縫い目は玉の中だけに出す（形からはみ出させない）。⚠️ 縫い目は形と一緒に回る
    g.save();
    shapePath(g, cx, cy, r, skin, angle);
    g.clip();
    if (angle !== 0) rotateAround(g, cx, cy, angle);
    stitches(g, cx, cy, r, skin.accent ?? '#c0392b');
    g.restore();
  }
}
