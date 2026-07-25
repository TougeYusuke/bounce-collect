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

function shapePath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, skin: BallSkin): void {
  if (skin.shape === 'star') return starPath(g, cx, cy, r);
  if (skin.shape === 'squircle') return squirclePath(g, cx, cy, r);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
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
 */
export function drawBall(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  skin: BallSkin,
  variant = 0,
  withShadow = true,
): void {
  const c = skinColors(skin, variant);

  if (withShadow) {
    g.save();
    g.fillStyle = 'rgba(0,0,0,.30)';
    shapePath(g, cx + r * 0.22, cy + r * 0.3, r, skin);
    g.fill();
    g.restore();
  }

  const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, c.hi);
  grad.addColorStop(0.62, c.mid);
  grad.addColorStop(1, c.lo);
  g.fillStyle = grad;
  shapePath(g, cx, cy, r, skin);
  g.fill();

  if (skin.pattern === 'baseball') {
    // 縫い目は玉の中だけに出す（形からはみ出させない）
    g.save();
    shapePath(g, cx, cy, r, skin);
    g.clip();
    stitches(g, cx, cy, r, skin.accent ?? '#c0392b');
    g.restore();
  }
}
