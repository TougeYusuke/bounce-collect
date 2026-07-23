export interface Ball {
  x: number;
  y: number;
  /** 1フレーム前の位置。速度は (x - px, y - py) で表される（Verlet方式） */
  px: number;
  py: number;
  /** この玉が実際には何個ぶんか。見た目1個でも中身500個があり得る */
  weight: number;
  /** 通過済みゲートのビットマスク（ゲートIDごとに1bit） */
  gateMask: number;
  /** 使用済みジャンプ台のビットマスク（ジャンプ台IDごとに1bit）。ゲートと同じ扱い */
  jumperMask: number;
  /** ジャンプ台を使った回数 */
  bounce: number;
  /**
   * ジャンプ台で打ち上げられて上昇している最中か。
   * この間は他の玉とぶつからない（落ちてくる玉に叩き落されるのを防ぐ）。
   * 下降に転じた時点で解除される。
   */
  flying: boolean;
  /** 眠り判定の観測を始めた時点の位置（ここからどれだけ動いたかで判定する） */
  anchorX: number;
  anchorY: number;
  /** 眠り判定の観測を始めてから何フレーム経ったか */
  sleepFrames: number;
  /** 計算対象から外れているか（衝突相手としては生きている） */
  sleeping: boolean;
  /** プール上で使用中か */
  alive: boolean;
  /** プール内での自分の位置。kill を O(1) にするために持つ */
  readonly index: number;
}

export interface SpawnOptions {
  weight?: number;
  gateMask?: number;
  jumperMask?: number;
  bounce?: number;
  flying?: boolean;
}

/**
 * 玉をあらかじめ上限ぶん確保して使い回す。
 * 毎フレーム new すると GC でカクつくため。
 */
export class BallPool {
  readonly balls: Ball[];
  readonly capacity: number;
  activeCount = 0;
  private freeList: number[] = [];

  constructor(capacity: number) {
    this.capacity = capacity;
    this.balls = new Array(capacity);
    for (let i = capacity - 1; i >= 0; i--) {
      this.balls[i] = {
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        weight: 1,
        gateMask: 0,
        jumperMask: 0,
        bounce: 0,
        flying: false,
        anchorX: 0,
        anchorY: 0,
        sleepFrames: 0,
        sleeping: false,
        alive: false,
        index: i,
      };
      this.freeList.push(i);
    }
  }

  spawn(x: number, y: number, opts?: SpawnOptions): Ball | null {
    const idx = this.freeList.pop();
    if (idx === undefined) return null;
    const b = this.balls[idx];
    b.x = x;
    b.y = y;
    b.px = x;
    b.py = y;
    b.weight = opts?.weight ?? 1;
    b.gateMask = opts?.gateMask ?? 0;
    b.jumperMask = opts?.jumperMask ?? 0;
    b.bounce = opts?.bounce ?? 0;
    b.flying = opts?.flying ?? false;
    b.anchorX = x;
    b.anchorY = y;
    b.sleepFrames = 0;
    b.sleeping = false;
    b.alive = true;
    this.activeCount++;
    return b;
  }

  kill(ball: Ball): void {
    if (!ball.alive) return;
    ball.alive = false;
    this.activeCount--;
    this.freeList.push(ball.index);
  }

  forEachActive(fn: (ball: Ball, index: number) => void): void {
    for (let i = 0; i < this.capacity; i++) {
      const b = this.balls[i];
      if (b.alive) fn(b, i);
    }
  }

  clear(): void {
    this.freeList.length = 0;
    for (let i = this.capacity - 1; i >= 0; i--) {
      this.balls[i].alive = false;
      this.freeList.push(i);
    }
    this.activeCount = 0;
  }
}
