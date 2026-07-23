import type { BallPool } from '../core/ball';
import { CONFIG } from '../core/config';
import type { Stage } from '../core/stage';
import type { Segment, World } from '../core/world';
import type { Renderer } from './types';

/**
 * Canvas 2D による描画。
 * 玉は毎回 arc() で描かず、1個ぶんをオフスクリーンに焼いて drawImage で並べる
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
  private sprite: HTMLCanvasElement | null = null;
  private spriteRadius = 0;

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

  private buildSprite(radius: number): HTMLCanvasElement {
    const dpr = window.devicePixelRatio || 1;
    const r = Math.max(1, radius * this.scale * dpr);
    const size = Math.ceil(r * 2) + 2;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (!g) throw new Error('スプライト用のコンテキストを取得できませんでした');
    const cx = size / 2;
    const grad = g.createRadialGradient(cx - r * 0.35, cx - r * 0.35, r * 0.1, cx, cx, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.65, '#eef3f7');
    grad.addColorStop(1, '#b9c7d3');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.fill();
    this.spriteRadius = radius;
    return c;
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
    this.sprite = null; // 拡大率が変わったので焼き直す
  }

  private drawSegment(seg: Segment, ox: number, oy: number, s: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(ox + seg.x1 * s, oy + seg.y1 * s);
    ctx.lineTo(ox + seg.x2 * s, oy + seg.y2 * s);
    ctx.stroke();
  }

  /** 画面のX座標を盤面の論理X座標に変換する */
  toLogicalX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    return (clientX - rect.left - this.offsetX) / this.scale;
  }

  /** ゲート・ジャンプ台・コップ。玉より先、静的形状より後に描く */
  private drawStage(stage: Stage, cupX: number, ox: number, oy: number, s: number): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const g of stage.gates) {
      const h = 14 * s;
      ctx.fillStyle = '#3fb98f';
      ctx.fillRect(ox + g.x1 * s, oy + g.y * s - h / 2, (g.x2 - g.x1) * s, h);
      ctx.fillStyle = '#08352a';
      ctx.font = `700 ${Math.max(8, Math.round(11 * s))}px system-ui, sans-serif`;
      ctx.fillText(`×${g.multiplier}`, ox + ((g.x1 + g.x2) / 2) * s, oy + g.y * s);
    }

    for (const j of stage.jumpers) {
      const h = 12 * s;
      ctx.fillStyle = '#4a9fe0';
      ctx.fillRect(ox + j.x1 * s, oy + j.y * s - h / 2, (j.x2 - j.x1) * s, h);
      ctx.fillStyle = '#062a47';
      ctx.font = `700 ${Math.max(7, Math.round(10 * s))}px system-ui, sans-serif`;
      ctx.fillText('▲▲▲', ox + ((j.x1 + j.x2) / 2) * s, oy + j.y * s);
    }

    // コップ（上部・玉の出口）
    const cw = CONFIG.CUP_WIDTH * s;
    const cy = oy + CONFIG.BALL_RADIUS * 2.2 * s;
    ctx.fillStyle = '#e0bd63';
    ctx.beginPath();
    ctx.moveTo(ox + cupX * s - cw / 2, cy - 13 * s);
    ctx.lineTo(ox + cupX * s + cw / 2, cy - 13 * s);
    ctx.lineTo(ox + cupX * s + cw * 0.28, cy + 11 * s);
    ctx.lineTo(ox + cupX * s - cw * 0.28, cy + 11 * s);
    ctx.closePath();
    ctx.fill();
  }

  draw(pool: BallPool, radius: number, stage?: Stage, cupX?: number): void {
    const dpr = window.devicePixelRatio || 1;
    if (!this.sprite || this.spriteRadius !== radius) {
      this.sprite = this.buildSprite(radius);
    }
    const ctx = this.ctx;
    const s = this.scale * dpr;
    const ox = this.offsetX * dpr;
    const oy = this.offsetY * dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 盤面（木の板のイメージ）
    ctx.fillStyle = '#8b6a45';
    ctx.fillRect(ox, oy, this.world.width * s, this.world.height * s);

    // 静的形状
    ctx.strokeStyle = '#5c4630';
    ctx.lineWidth = Math.max(2, 4 * s);
    ctx.lineCap = 'round';
    for (const seg of this.world.segments) this.drawSegment(seg, ox, oy, s);

    // ゲート・ジャンプ台・コップ（玉より先に描く。逆だと玉に隠れる）
    if (stage) this.drawStage(stage, cupX ?? this.world.width / 2, ox, oy, s);

    // 玉
    const sprite = this.sprite;
    const half = sprite.width / 2;
    pool.forEachActive((b) => {
      ctx.drawImage(sprite, ox + b.x * s - half, oy + b.y * s - half);
    });
  }

  destroy(): void {
    this.canvas?.remove();
  }
}
