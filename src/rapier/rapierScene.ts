import RAPIER from '@dimforge/rapier2d-compat';

/**
 * Rapier2D が「緩い斜面で玉が流れるか」を測るための最小シーン。
 *
 * 自作の位置ベースソルバでは 12〜15度の斜面で玉が噛み合って流れず、
 * 出口に届かなかった。摩擦を正確に扱えるエンジンなら流れるのか——
 * それだけを確かめる。ゲーム本体には手を入れない。
 *
 * ⚠️ Rapier は「1単位 = 1メートル」を想定している。px のまま渡すと
 * ソルバの精度が落ちるので、100px = 1m にスケールして計算する。
 */
const PX_PER_M = 100;

export interface RapierSceneOptions {
  boardWidth: number;
  boardHeight: number;
  ballRadius: number;
  /** V字の角度（度）。小さいほど緩やか */
  angleDeg: number;
  /** 出口の幅（玉何個ぶん） */
  outletBalls: number;
  /** 玉同士・玉と床の摩擦。0 でつるつる */
  friction: number;
  /** 跳ね返り */
  restitution: number;
}

export interface BallView {
  x: number;
  y: number;
}

export class RapierScene {
  private world!: RAPIER.World;
  private bodies: RAPIER.RigidBody[] = [];
  private opts: RapierSceneOptions;
  /** 回収して消した玉の数 */
  collected = 0;
  spawned = 0;

  constructor(opts: RapierSceneOptions) {
    this.opts = opts;
  }

  static async load(): Promise<void> {
    await RAPIER.init();
  }

  private toM(px: number): number {
    return px / PX_PER_M;
  }

  build(): void {
    const o = this.opts;
    // 画面と同じ向き（y が下）にしたいので重力は +y
    this.world = new RAPIER.World({ x: 0, y: 9.81 });
    this.world.timestep = 1 / 60;

    const w = this.toM(o.boardWidth);
    const h = this.toM(o.boardHeight);
    const r = this.toM(o.ballRadius);

    const wall = (ax: number, ay: number, bx: number, by: number) => {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const desc = RAPIER.ColliderDesc.segment({ x: ax, y: ay }, { x: bx, y: by });
      desc.setFriction(o.friction);
      desc.setRestitution(o.restitution);
      this.world.createCollider(desc, body);
    };

    // 盤面の左右と天井
    wall(0, -h, 0, h * 2);
    wall(w, -h, w, h * 2);
    wall(0, 0, w, 0);

    // V字の漏斗（ゲーム側と同じ作り方）
    const bottomY = this.toM(o.boardHeight - 70);
    const halfOutlet = this.toM(o.ballRadius * o.outletBalls);
    const run = w * 0.5 - halfOutlet;
    const rise = run * Math.tan((o.angleDeg * Math.PI) / 180);
    const topY = Math.max(this.toM(o.ballRadius * 6), bottomY - rise);
    const slope = (bottomY - topY) / run;
    const over = this.toM(o.ballRadius * 4);
    wall(-over, topY - over * slope, w * 0.5 - halfOutlet, bottomY);
    wall(w + over, topY - over * slope, w * 0.5 + halfOutlet, bottomY);

    this.bodies = [];
    this.collected = 0;
    this.spawned = 0;
    void r;
  }

  /** 盤面に詰められるだけ玉を並べる（自作版の prefill と同じ考え方） */
  prefill(limit: number): number {
    const o = this.opts;
    const r = this.toM(o.ballRadius);
    const gap = r * 2 + this.toM(0.6);
    const top = r + this.toM(4);
    const bottom = this.toM(o.boardHeight - 260);
    const w = this.toM(o.boardWidth);

    let placed = 0;
    for (let y = bottom; y > top && placed < limit; y -= gap) {
      for (let x = r + this.toM(1); x < w - r && placed < limit; x += gap) {
        this.spawnAt(x, y);
        placed++;
      }
    }
    this.spawned = placed;
    return placed;
  }

  private spawnAt(xM: number, yM: number): void {
    const o = this.opts;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(xM, yM).setLinearDamping(0.05),
    );
    const desc = RAPIER.ColliderDesc.ball(this.toM(o.ballRadius));
    desc.setFriction(o.friction);
    desc.setRestitution(o.restitution);
    desc.setDensity(1);
    this.world.createCollider(desc, body);
    this.bodies.push(body);
  }

  /** 1フレーム進める。回収ラインを越えた玉は消す */
  step(): void {
    this.world.step();
    const limit = this.toM(this.opts.boardHeight - 30);
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.translation().y >= limit) {
        this.world.removeRigidBody(b);
        this.bodies.splice(i, 1);
        this.collected++;
      }
    }
  }

  get activeCount(): number {
    return this.bodies.length;
  }

  /** 動いている（眠っていない）玉の数 */
  get awakeCount(): number {
    let n = 0;
    for (const b of this.bodies) if (!b.isSleeping()) n++;
    return n;
  }

  /** 描画用に px 座標で位置を取り出す */
  readBalls(out: BallView[]): number {
    let i = 0;
    for (const b of this.bodies) {
      const t = b.translation();
      if (!out[i]) out[i] = { x: 0, y: 0 };
      out[i].x = t.x * PX_PER_M;
      out[i].y = t.y * PX_PER_M;
      i++;
    }
    return i;
  }

  /** 盤面の線（描画用・px座標） */
  get funnelLines(): Array<[number, number, number, number]> {
    const o = this.opts;
    const bottomY = o.boardHeight - 70;
    const halfOutlet = o.ballRadius * o.outletBalls;
    const run = o.boardWidth * 0.5 - halfOutlet;
    const rise = run * Math.tan((o.angleDeg * Math.PI) / 180);
    const topY = Math.max(o.ballRadius * 6, bottomY - rise);
    return [
      [0, topY, o.boardWidth * 0.5 - halfOutlet, bottomY],
      [o.boardWidth, topY, o.boardWidth * 0.5 + halfOutlet, bottomY],
    ];
  }
}
