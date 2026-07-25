import type { BucketSkin } from './theme';

/**
 * 玉を入れる器（上のカップ／下の受け皿）の絵。
 *
 * 🔑 **木製にこだわらない**（2026-07-25 れいあ方針「タンブラーとか、それこそ鉄のバケツとか」）。
 *    ⚠️ 画像を増やさずに**輪郭から描く**。素材を1つ足すたびに画像を用意する形にすると、
 *    種類を増やすほど手間が増える（型のサムネイルをやめたのと同じ理由）。
 * ⚠️ **実物と工房のプレビューで同じ関数を使う**。別々に描くと種類を足した時にプレビューだけ古くなる。
 *
 * ⚠️ 大きさの約束（守ること）:
 *    - 口（開口部）の中心は `(cx, cyTop)`、口の半幅は `hw`
 *    - 胴は下へ `hw * 2` くらいまで
 *    玉の湧く位置（`CONFIG.CUP_ROLL_*`）はこの寸法に合わせて詰めてあるので、
 *    器を足すときも同じ枠に収めること。はみ出すと「玉が器の外から出る」ように見える。
 */

/** 縦のグラデーション（丸みを出す。左が暗く中央が明るい） */
function bodyFill(
  g: CanvasRenderingContext2D,
  x: number,
  w: number,
  skin: BucketSkin,
): CanvasGradient {
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, skin.shade);
  grad.addColorStop(0.38, skin.body);
  grad.addColorStop(0.72, skin.body);
  grad.addColorStop(1, skin.shade);
  return grad;
}

/** 口の楕円（縁のリング） */
function mouth(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  skin: BucketSkin,
  lift = 0.27,
): void {
  g.fillStyle = skin.inner;
  g.beginPath();
  g.ellipse(cx, cy, hw * 0.94, hw * lift, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = skin.rim;
  g.lineWidth = Math.max(1.5, hw * 0.11);
  g.beginPath();
  g.ellipse(cx, cy, hw * 0.94, hw * lift, 0, 0, Math.PI * 2);
  g.stroke();
}

/** 台形の胴（下が細い＝バケツ／下が同じ＝コップ） */
function taperedBody(
  g: CanvasRenderingContext2D,
  cx: number,
  cyTop: number,
  hw: number,
  h: number,
  bottomRatio: number,
  skin: BucketSkin,
): void {
  const bw = hw * bottomRatio;
  g.fillStyle = bodyFill(g, cx - hw, hw * 2, skin);
  g.beginPath();
  g.moveTo(cx - hw, cyTop);
  g.lineTo(cx + hw, cyTop);
  g.lineTo(cx + bw, cyTop + h);
  g.quadraticCurveTo(cx, cyTop + h + hw * 0.2, cx - bw, cyTop + h);
  g.closePath();
  g.fill();
}

/** 横の帯（たが・リング） */
function hoop(
  g: CanvasRenderingContext2D,
  cx: number,
  y: number,
  hw: number,
  skin: BucketSkin,
): void {
  g.strokeStyle = skin.rim;
  g.lineWidth = Math.max(1.5, hw * 0.13);
  g.beginPath();
  g.moveTo(cx - hw, y);
  g.lineTo(cx + hw, y);
  g.stroke();
}

/** 取っ手（横に付く輪。マグカップ用） */
function sideHandle(
  g: CanvasRenderingContext2D,
  cx: number,
  cyTop: number,
  hw: number,
  h: number,
  skin: BucketSkin,
): void {
  g.strokeStyle = skin.rim;
  g.lineWidth = Math.max(2, hw * 0.17);
  g.beginPath();
  g.arc(cx + hw * 0.92, cyTop + h * 0.45, h * 0.3, -Math.PI * 0.45, Math.PI * 0.45);
  g.stroke();
}

/**
 * 器を1つ描く。`cyTop` が口の高さ、`hw` が口の半幅。
 * ⚠️ 傾ける処理は呼ぶ側（回転済みの座標系で呼ばれる）。
 */
export function drawVessel(
  g: CanvasRenderingContext2D,
  cx: number,
  cyTop: number,
  hw: number,
  skin: BucketSkin,
): void {
  const h = hw * 2;

  switch (skin.form) {
    case 'pail': {
      // 鉄のバケツ: 下が細い胴＋たが2本＋口の巻き縁
      taperedBody(g, cx, cyTop, hw, h, 0.72, skin);
      hoop(g, cx, cyTop + h * 0.34, hw * 0.93, skin);
      hoop(g, cx, cyTop + h * 0.7, hw * 0.8, skin);
      mouth(g, cx, cyTop, hw, skin);
      break;
    }
    case 'tumbler': {
      // タンブラー: ほぼ真っすぐ。縦のハイライトで金属感を出す
      taperedBody(g, cx, cyTop, hw, h * 1.05, 0.9, skin);
      g.save();
      g.globalAlpha = 0.35;
      g.fillStyle = '#ffffff';
      g.fillRect(cx - hw * 0.52, cyTop + h * 0.12, hw * 0.2, h * 0.78);
      g.restore();
      mouth(g, cx, cyTop, hw, skin, 0.22);
      break;
    }
    case 'mug': {
      // マグカップ: 真っすぐな胴＋横の取っ手
      sideHandle(g, cx, cyTop, hw, h, skin);
      taperedBody(g, cx, cyTop, hw, h * 0.92, 0.88, skin);
      mouth(g, cx, cyTop, hw, skin, 0.24);
      break;
    }
    case 'glass': {
      // ガラス: 中が透ける。⚠️ 玉より後に描くので、透けないと中の玉が隠れて見えない
      g.save();
      g.globalAlpha = 0.55;
      taperedBody(g, cx, cyTop, hw, h * 1.02, 0.84, skin);
      g.restore();
      g.save();
      g.globalAlpha = 0.5;
      g.fillStyle = '#ffffff';
      g.fillRect(cx - hw * 0.55, cyTop + h * 0.1, hw * 0.16, h * 0.8);
      g.restore();
      mouth(g, cx, cyTop, hw, skin, 0.22);
      break;
    }
    default: {
      // 樽（木のバケツを描き起こした形）。たが3本で木らしさを出す
      taperedBody(g, cx, cyTop, hw, h, 0.78, skin);
      hoop(g, cx, cyTop + h * 0.28, hw * 0.95, skin);
      hoop(g, cx, cyTop + h * 0.62, hw * 0.86, skin);
      mouth(g, cx, cyTop, hw, skin);
    }
  }
}
