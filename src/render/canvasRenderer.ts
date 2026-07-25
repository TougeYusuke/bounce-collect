import type { BallPool } from '../core/ball';
import { CONFIG } from '../core/config';
import { cupTiltPivot } from '../core/cupPose';
import type { Stage } from '../core/stage';
import type { World } from '../core/world';
import { getArt } from './art';
import { drawBall, skinVariants } from './ballArt';
import { BALL_SKINS, MATERIALS, SKIN, type BallSkin, type Material } from './theme';
import type { Renderer } from './types';

/**
 * Canvas 2D による描画。木のおもちゃ工房テイスト。
 * 見た目の設計は mockup/ui-2026-07-24.html が参照元（描画コードはそこから移植）。
 *
 * 玉は毎回 arc() で描かず、1個ぶん（落ち影込み）をオフスクリーンに焼いて drawImage で並べる
 * （同じ絵を数千回描くだけになるので、パスを引き直すより速い）。
 */
export class CanvasRenderer implements Renderer {
  readonly name = 'Canvas2D';
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private world!: World;
  private host!: HTMLElement;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  /**
   * 焼いた玉の絵。マーブル（複数色）は色数ぶん持って、玉の番号で振り分ける。
   * ⚠️ 半径・拡大率・スキンのどれかが変わったら捨てて焼き直す。
   */
  private sprites: HTMLCanvasElement[] | null = null;
  private spriteRadius = 0;
  private spriteHalf = 0;
  private material: Material = MATERIALS[0];
  /** 玉の見た目（工房で解放していく）。⚠️ 変えたらスプライトを焼き直す */
  private ballSkin: BallSkin = BALL_SKINS[0];

  async init(container: HTMLElement, world: World): Promise<void> {
    this.world = world;
    this.host = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D コンテキストを取得できませんでした');
    this.ctx = ctx;
    this.resize();
  }

  /** 素材テーマを差し替える。盤面画像・傾斜板の色・背景色が変わる */
  setMaterial(m: Material): void {
    this.material = m;
  }

  /** 玉の見た目を差し替える。⚠️ 焼いてあるスプライトを捨てて焼き直す */
  setBallSkin(b: BallSkin): void {
    if (this.ballSkin.key === b.key) return;
    this.ballSkin = b;
    this.sprites = null;
  }

  /**
   * 玉の絵（落ち影込み）を焼く。影のぶん余白を取る。
   * ⚠️ 描くのは `ballArt.drawBall` に任せる＝工房のプレビューと同じ絵になる。
   */
  private buildSprites(radius: number): HTMLCanvasElement[] {
    const dpr = window.devicePixelRatio || 1;
    const r = Math.max(1, radius * this.scale * dpr);
    const pad = Math.ceil(r * 0.5) + 2; // 影のオフセットぶんの余白
    const size = Math.ceil(r * 2) + pad * 2;
    const out: HTMLCanvasElement[] = [];
    for (let v = 0; v < skinVariants(this.ballSkin); v++) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      if (!g) throw new Error('スプライト用のコンテキストを取得できませんでした');
      drawBall(g, size / 2, size / 2, r, this.ballSkin, v);
      out.push(c);
    }
    this.spriteRadius = radius;
    this.spriteHalf = size / 2;
    return out;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.scale = Math.min(w / this.world.width, h / this.world.height);
    this.offsetX = (w - this.world.width * this.scale) / 2;
    this.offsetY = (h - this.world.height * this.scale) / 2;
    this.sprites = null; // 拡大率が変わったので焼き直す
  }

  /** 画面のX座標を盤面の論理X座標に変換する */
  toLogicalX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    return (clientX - rect.left - this.offsetX) / this.scale;
  }

  /**
   * 盤面が実際に描かれている領域（CSSピクセル）。
   * PCの横長画面だと盤面は中央に寄って左右に余白ができるので、
   * HUDをこの幅に合わせて画面端でなく盤面の縁に置くために使う。
   */
  boardRectCss(): { left: number; top: number; width: number; height: number } {
    return {
      left: this.offsetX,
      top: this.offsetY,
      width: this.world.width * this.scale,
      height: this.world.height * this.scale,
    };
  }

  private roundRect(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /**
   * 木のバケツ。cyTop = 口（飲み口）の高さ（論理座標）。上下で共用する。
   * tilt（ラジアン）を渡すと、口の下あたりを軸に傾ける（玉を注いでいる様子）。
   */
  private drawBucket(
    g: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    s: number,
    cx: number,
    cyTop: number,
    k: number,
    tilt = 0,
  ): void {
    const x = ox + cx * s;
    const y = oy + cyTop * s;
    const hw = 27 * k * s;
    const hh = 34 * k * s;

    g.save();
    if (tilt !== 0) {
      // 口を固定する平行移動は入れず、画像の見た目上の中心でそのまま回す。
      // 発生点は core/cupPose.ts がこの回転と同じ式で動かすので、バケツを浮かせず口と玉を揃えられる。
      const pivot = cupTiltPivot(cx, cyTop);
      const px = ox + pivot.x * s;
      const py = oy + pivot.y * s;
      g.translate(px, py);
      g.rotate(tilt);
      g.translate(-px, -py);
    }

    const im = getArt('bucket-wood.png');
    if (im) {
      const w = hw * 2.15;
      const h = w * (im.height / im.width);
      g.save();
      g.shadowColor = 'rgba(0,0,0,.5)';
      g.shadowBlur = 12 * s;
      g.shadowOffsetY = 5 * s;
      g.drawImage(im, x - w / 2, y - h * 0.17, w, h);
      g.restore();
      g.restore();
      return;
    }

    // フォールバック（画像が無いとき）
    const grad = g.createLinearGradient(x - hw, 0, x + hw, 0);
    grad.addColorStop(0, '#7a5228');
    grad.addColorStop(0.38, '#b5814a');
    grad.addColorStop(1, '#7a5228');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - hw, y);
    g.lineTo(x + hw, y);
    g.lineTo(x + hw * 0.66, y + hh);
    g.lineTo(x - hw * 0.66, y + hh);
    g.closePath();
    g.fill();
    g.fillStyle = '#4a2f14';
    g.beginPath();
    g.ellipse(x, y, hw * 0.94, hw * 0.27, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /** 傾斜板（中身の詰まった台形）を、下端まで塗らず「厚みのある帯」として描く */
  private drawWedges(g: CanvasRenderingContext2D, stage: Stage, ox: number, oy: number, s: number): void {
    const wedges = stage.wedges;
    if (!wedges) return;
    const t = this.material;
    const thick = 22;
    g.save();
    g.shadowColor = 'rgba(0,0,0,.5)';
    g.shadowBlur = 12 * s;
    g.shadowOffsetY = 5 * s;
    g.fillStyle = t.wedge;
    for (const wd of wedges) {
      g.beginPath();
      g.moveTo(ox + wd.x1 * s, oy + wd.y1 * s);
      g.lineTo(ox + wd.x2 * s, oy + wd.y2 * s);
      g.lineTo(ox + wd.x2 * s, oy + (wd.y2 + thick) * s);
      g.lineTo(ox + wd.x1 * s, oy + (wd.y1 + thick) * s);
      g.closePath();
      g.fill();
    }
    g.restore();
    // 上面のハイライト（滑る面だと分かる）
    g.strokeStyle = t.wedgeTop;
    g.lineWidth = Math.max(2, 3 * s);
    g.lineCap = 'round';
    for (const wd of wedges) {
      g.beginPath();
      g.moveTo(ox + wd.x1 * s, oy + wd.y1 * s);
      g.lineTo(ox + wd.x2 * s, oy + wd.y2 * s);
      g.stroke();
    }
  }

  /** 傾斜以外の線分（＝中央の仕切り）を真鍮の丸棒として描く。木と同系色だと沈むため */
  private drawDividers(g: CanvasRenderingContext2D, stage: Stage, ox: number, oy: number, s: number): void {
    const wedgeSet = new Set(stage.wedges ?? []);
    const dw = Math.max(3, CONFIG.DIVIDER_THICKNESS * s);
    for (const seg of stage.segments) {
      // wedge と同じオブジェクトは傾斜板として別途描いたのでスキップ
      if (wedgeSet.has(seg as never)) continue;
      const x1 = ox + seg.x1 * s;
      const y1 = oy + seg.y1 * s;
      const x2 = ox + seg.x2 * s;
      const y2 = oy + seg.y2 * s;
      const rod = g.createLinearGradient(x1 - dw / 2, 0, x1 + dw / 2, 0);
      rod.addColorStop(0, SKIN.metalDark);
      rod.addColorStop(0.35, SKIN.metal);
      rod.addColorStop(1, SKIN.metalDark);
      g.save();
      g.shadowColor = 'rgba(0,0,0,.6)';
      g.shadowBlur = 8 * s;
      g.shadowOffsetX = 2 * s;
      g.shadowOffsetY = 3 * s;
      g.strokeStyle = rod;
      g.lineWidth = dw;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.restore();
    }
  }

  private drawGates(g: CanvasRenderingContext2D, stage: Stage, ox: number, oy: number, s: number): void {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const gt of stage.gates) {
      const h = CONFIG.GATE_THICKNESS * s;
      const x = ox + gt.x1 * s;
      const w = (gt.x2 - gt.x1) * s;
      const y = oy + gt.y * s - h / 2;
      // 増えた直後は帯もラベルも光らせる。⚠️ 玉の山に埋まると、これが無いと
      //    「いま増えている」が画面に一切出ない（2026-07-25 本家の動画で判明）
      const lit = (gt.flash ?? 0) / CONFIG.GATE_FLASH_FRAMES;
      g.save();
      g.shadowColor = SKIN.gateGlow;
      g.shadowBlur = (16 + 26 * lit) * s;
      g.fillStyle = SKIN.gate;
      this.roundRect(g, x, y, w, h, h / 2);
      g.fill();
      g.restore();
      const gl = g.createLinearGradient(0, y, 0, y + h);
      gl.addColorStop(0, `rgba(255,255,255,${0.45 + 0.4 * lit})`);
      gl.addColorStop(0.5, `rgba(255,255,255,${0.3 * lit})`);
      g.fillStyle = gl;
      this.roundRect(g, x, y, w, h, h / 2);
      g.fill();
      g.fillStyle = SKIN.gateInk;
      const size = 12 * (1 + (CONFIG.GATE_FLASH_SCALE - 1) * lit);
      g.font = `800 ${Math.max(9, Math.round(size * s))}px ui-rounded, system-ui, sans-serif`;
      g.fillText(`×${gt.multiplier}`, ox + ((gt.x1 + gt.x2) / 2) * s, oy + gt.y * s + 0.5);
    }
  }

  private drawJumpers(g: CanvasRenderingContext2D, stage: Stage, ox: number, oy: number, s: number): void {
    for (const j of stage.jumpers) {
      const h = CONFIG.JUMPER_THICKNESS * s;
      const x = ox + j.x1 * s;
      const w = (j.x2 - j.x1) * s;
      const y = oy + j.y * s - h / 2;
      g.save();
      g.shadowColor = SKIN.jumpGlow;
      g.shadowBlur = 14 * s;
      g.fillStyle = SKIN.jump;
      this.roundRect(g, x, y, w, h, h / 2);
      g.fill();
      g.restore();
      // 文字ではなく三角形の図形
      g.fillStyle = SKIN.jumpInk;
      const n = 3;
      const step = w / (n + 1);
      const tw = 5.5 * s;
      for (let i = 1; i <= n; i++) {
        const cx = x + step * i;
        g.beginPath();
        g.moveTo(cx, y + h * 0.24);
        g.lineTo(cx + tw / 2, y + h * 0.76);
        g.lineTo(cx - tw / 2, y + h * 0.76);
        g.closePath();
        g.fill();
      }

      // デバッグ: この台があと何個の玉を跳ね返せるか（バーの真上に出す）
      if (this.showDebug) {
        const left = Math.max(0, j.capacity - j.used);
        g.save();
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.font = `800 ${Math.max(10, Math.round(13 * s))}px ui-rounded, system-ui, sans-serif`;
        g.shadowColor = 'rgba(0,0,0,.9)';
        g.shadowBlur = 5 * s;
        g.fillStyle = left > 0 ? '#ffffff' : '#ff8b6b'; // 使い切ったら赤
        g.fillText(`残${left}`, x + w / 2, y - 4 * s);
        g.restore();
      }
    }
  }

  /** 下バケツを描くか。R2は「底にバケツが無い」ので消す */
  showBottomBucket = true;
  /** 下バケツを下へずらす量（論理px）。R1→R2 で下へ流れて退場する演出に使う */
  bottomBucketOffsetY = 0;
  /**
   * 盤面ごと縦にずらす量（論理px）。
   * R1→R2 の場面転換で「カメラが下へ降りていく」ように見せるのに使う。
   * 負で盤面が上へ抜け、正で下から入ってくる。
   */
  boardOffsetY = 0;
  /** 上バケツの横に出す残り玉数。null で非表示 */
  cupCount: number | null = null;
  /** デバッグ表示（ジャンプ台の残り回数など）。URLに ?debug=1 で入る */
  showDebug = false;

  draw(pool: BallPool, radius: number, stage?: Stage, cupX?: number, cupTilt = 0): void {
    const dpr = window.devicePixelRatio || 1;
    if (!this.sprites || this.spriteRadius !== radius) {
      this.sprites = this.buildSprites(radius);
    }
    const ctx = this.ctx;
    const s = this.scale * dpr;
    const ox = this.offsetX * dpr;
    // 場面転換のスクロールぶんを足す（盤面の中身ごと動く）
    const oy = this.offsetY * dpr + this.boardOffsetY * s;
    const t = this.material;
    const W = this.world.width;
    const H = this.world.height;

    // 盤面の外側（余白）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = t.outer;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 盤面（素材画像。無ければグラデでフォールバック）
    const board = getArt(t.board);
    if (board) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.65)';
      ctx.shadowBlur = 30 * s;
      ctx.shadowOffsetY = 6 * s;
      ctx.drawImage(board, ox, oy, W * s, H * s);
      ctx.restore();
    } else {
      const bg = ctx.createLinearGradient(0, oy, 0, oy + H * s);
      bg.addColorStop(0, '#9c7649');
      bg.addColorStop(1, '#6d4f31');
      ctx.fillStyle = bg;
      ctx.fillRect(ox, oy, W * s, H * s);
    }

    // 以降は盤面の内側だけに描く
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, W * s, H * s);
    ctx.clip();

    // 内側の影（板がへこんで見える）
    const vig = ctx.createRadialGradient(
      ox + (W / 2) * s,
      oy + (H / 2) * s,
      W * s * 0.2,
      ox + (W / 2) * s,
      oy + (H / 2) * s,
      W * s * 0.95,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(ox, oy, W * s, H * s);

    if (stage) {
      // 傾斜板 → 下バケツ の順（下バケツは玉より先＝中に溜まって見える）
      this.drawWedges(ctx, stage, ox, oy, s);
      if (this.showBottomBucket) {
        this.drawBucket(ctx, ox, oy, s, W / 2, stage.collectY + this.bottomBucketOffsetY, 0.95);
      }
    }

    // 残像（玉より先に描く＝尾が玉の下に潜る）。
    // ⚠️ 玉ごとに stroke すると1000個で1000回の描画呼び出しになるので、
    //    1本のパスにまとめて**1回**で塗る。速い玉だけを対象にして本数も抑える。
    if (CONFIG.TRAIL_ALPHA > 0) {
      const minSq = CONFIG.TRAIL_MIN_SPEED * CONFIG.TRAIL_MIN_SPEED;
      ctx.beginPath();
      pool.forEachActive((b) => {
        const vx = b.x - b.px;
        const vy = b.y - b.py;
        const sq = vx * vx + vy * vy;
        if (sq < minSq) return;
        const v = Math.sqrt(sq);
        const len = Math.min(CONFIG.TRAIL_MAX_LENGTH, v * CONFIG.TRAIL_SCALE);
        const k = len / v;
        ctx.moveTo(ox + b.x * s, oy + b.y * s);
        ctx.lineTo(ox + (b.x - vx * k) * s, oy + (b.y - vy * k) * s);
      });
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${CONFIG.TRAIL_ALPHA})`;
      ctx.lineWidth = radius * 1.15 * s;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // 玉（落ち影はスプライトに焼き込み済み）
    const sprites = this.sprites;
    const variants = sprites.length;
    const half = this.spriteHalf;
    // ⚠️ 見た目は常に通常サイズ・不透明で描く（れいあ指定 2026-07-24）。
    //    小さくしているのは当たり判定だけ＝生まれた瞬間に周りを押しのけないため。
    //    （一時期フェードインを入れていたが、すぐ出る方を見たいとの判断で外した）
    pool.forEachActive((b) => {
      // ⚠️ 色の振り分けは**プールの番号**で決める（乱数を使わない＝同じ状況なら同じ絵）
      const sp = variants === 1 ? sprites[0] : sprites[b.index % variants];
      ctx.drawImage(sp, ox + b.x * s - half, oy + b.y * s - half);
    });

    // ⚠️ 仕切り・ゲート・ジャンプ台は**玉より後**（＝玉の上）に描く（2026-07-25）。
    //    玉の下に描いていた頃は、山が積もると部品が完全に埋まって見えなくなり、
    //    「山がゲートを押し越えて増える」という一番見たい瞬間が画面に出ていなかった
    //    （本家も部品を玉の上に描いている・れいあの参考動画で確認）。
    if (stage) {
      this.drawDividers(ctx, stage, ox, oy, s);
      this.drawGates(ctx, stage, ox, oy, s);
      this.drawJumpers(ctx, stage, ox, oy, s);
    }

    // 上バケツ（玉より後＝玉がバケツの下から出てくる）。玉を出している間は傾ける
    const cx = cupX ?? W / 2;
    this.drawBucket(ctx, ox, oy, s, cx, CONFIG.CUP_Y, 1.0, cupTilt);
    // バケツの中に残っている玉の数（バケツの左に置く）
    if (this.cupCount !== null) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.max(11, Math.round(19 * s))}px ui-rounded, system-ui, sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,.85)';
      ctx.shadowBlur = 6 * s;
      ctx.fillStyle = SKIN.metal;
      ctx.fillText(this.cupCount.toLocaleString('ja-JP'), ox + (cx - 34) * s, oy + (CONFIG.CUP_Y + 14) * s);
      ctx.restore();
    }

    ctx.restore();

    // 盤面の縁
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.strokeRect(ox, oy, W * s, H * s);
  }

  destroy(): void {
    this.canvas?.remove();
  }
}
