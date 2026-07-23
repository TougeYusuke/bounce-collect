import {
  Application,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Texture,
} from 'pixi.js';
import type { BallPool } from '../core/ball';
import type { World } from '../core/world';
import type { Renderer } from './types';

/**
 * PixiJS (WebGL) による描画。
 *
 * ParticleContainer を使い、動かすのは位置だけ（dynamicProperties.position のみ true）。
 * 回転・色・UV を静的にすると、GPU に送るデータが位置だけになって一番速くなる。
 *
 * ⚠️ PixiJS v8 の API を前提にしている（v7 とは書き方が違う）:
 *   - new Application() のあと await app.init()
 *   - app.canvas（v7 の app.view ではない）
 *   - particleChildren を直接いじったら container.update() が必要
 */
export class PixiRenderer implements Renderer {
  readonly name = 'PixiJS';
  private app: Application | null = null;
  private layer: Container | null = null;
  private particles: ParticleContainer | null = null;
  private texture: Texture | null = null;
  private world!: World;
  private host!: HTMLElement;
  private items: Particle[] = [];
  /** テクスチャに焼いた円の半径（論理座標へ換算するときの基準） */
  private readonly texRadius = 32;

  async init(container: HTMLElement, world: World): Promise<void> {
    this.world = world;
    this.host = container;
    const app = new Application();
    await app.init({
      resizeTo: container,
      background: 0x101820,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    app.canvas.style.position = 'absolute';
    app.canvas.style.inset = '0';
    container.appendChild(app.canvas);
    // 描画のタイミングは main.ts のループが握るので、Pixi 側の自動描画は止める
    app.ticker.stop();
    this.app = app;

    const circle = new Graphics().circle(0, 0, this.texRadius).fill(0xf2f6fa);
    this.texture = app.renderer.generateTexture(circle);
    circle.destroy();

    this.layer = new Container();
    app.stage.addChild(this.layer);

    // 盤面と静的形状
    const board = new Graphics();
    board.rect(0, 0, world.width, world.height).fill(0x8b6a45);
    for (const seg of world.segments) {
      board
        .moveTo(seg.x1, seg.y1)
        .lineTo(seg.x2, seg.y2)
        .stroke({ width: 4, color: 0x5c4630, cap: 'round' });
    }
    this.layer.addChild(board);

    this.particles = new ParticleContainer({
      dynamicProperties: { position: true, rotation: false, color: false, uvs: false },
    });
    this.layer.addChild(this.particles);

    this.resize();
  }

  resize(): void {
    if (!this.layer) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const scale = Math.min(w / this.world.width, h / this.world.height);
    this.layer.x = (w - this.world.width * scale) / 2;
    this.layer.y = (h - this.world.height * scale) / 2;
    this.layer.scale.set(scale);
  }

  /** 玉の数に合わせて粒子を用意する（減らさず使い回す） */
  private ensureCapacity(needed: number, radius: number): void {
    const pc = this.particles;
    const tex = this.texture;
    if (!pc || !tex) return;
    if (this.items.length >= needed) return;

    const s = radius / this.texRadius;
    while (this.items.length < needed) {
      const p = new Particle({
        texture: tex,
        x: -1000, // 使われるまで画面外に置いておく
        y: -1000,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: s,
        scaleY: s,
      });
      this.items.push(p);
      pc.addParticle(p);
    }
    pc.update(); // 配列を直接増やしたので更新が要る
  }

  /** 画面のX座標を盤面の論理X座標に変換する */
  toLogicalX(clientX: number): number {
    const rect = this.app?.canvas.getBoundingClientRect();
    if (!rect || !this.layer) return 0;
    return (clientX - rect.left - this.layer.x) / this.layer.scale.x;
  }

  /** stage / cupX は受け取るが描かない（本採用は Canvas2D・こちらは比較用）*/
  draw(pool: BallPool, radius: number): void {
    const app = this.app;
    if (!app || !this.particles) return;
    this.ensureCapacity(pool.capacity, radius);

    let i = 0;
    pool.forEachActive((b) => {
      const p = this.items[i++];
      p.x = b.x;
      p.y = b.y;
    });
    // 余った粒子は画面外へ逃がす（位置は動的なので追加コストなしで隠せる）
    for (let k = i; k < this.items.length; k++) {
      const p = this.items[k];
      if (p.x !== -1000) {
        p.x = -1000;
        p.y = -1000;
      }
    }

    app.renderer.render(app.stage);
  }

  destroy(): void {
    this.items = [];
    this.texture = null;
    this.particles = null;
    this.layer = null;
    this.app?.destroy(true, { children: true });
    this.app = null;
  }
}
