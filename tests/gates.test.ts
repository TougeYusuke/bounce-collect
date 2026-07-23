import { describe, it, expect } from 'vitest';
import { crossedGate, applyGates } from '../src/core/gates';
import { BallPool } from '../src/core/ball';
import type { Gate, Stage } from '../src/core/stage';

const gate: Gate = { id: 0, x1: 100, x2: 200, y: 300, multiplier: 4, capacity: 1e9, used: 0 };

describe('crossedGate', () => {
  it('上から下へまたいだら通過', () => {
    expect(crossedGate(150, 295, 150, 305, gate)).toBe(true);
  });

  it('下から上へまたいでも通過（ジャンプ台で戻る時のため）', () => {
    expect(crossedGate(150, 305, 150, 295, gate)).toBe(true);
  });

  it('またいでいなければ通過しない', () => {
    expect(crossedGate(150, 280, 150, 295, gate)).toBe(false);
    expect(crossedGate(150, 310, 150, 320, gate)).toBe(false);
  });

  it('x が範囲外なら通過しない', () => {
    expect(crossedGate(50, 295, 50, 305, gate)).toBe(false);
    expect(crossedGate(250, 295, 250, 305, gate)).toBe(false);
  });

  it('範囲の境界ちょうどは通過とみなす', () => {
    expect(crossedGate(100, 295, 100, 305, gate)).toBe(true);
    expect(crossedGate(200, 295, 200, 305, gate)).toBe(true);
  });

  it('y がぴったり同じ位置に来た場合も通過とみなす', () => {
    expect(crossedGate(150, 295, 150, 300, gate)).toBe(true);
  });
});

describe('applyGates（増殖ルール）', () => {
  const stage: Stage = {
    segments: [],
    gates: [{ id: 0, x1: 0, x2: 360, y: 300, multiplier: 4, capacity: 1e9, used: 0 }],
    jumpers: [],
    collectY: 700,
  };

  function ballCrossing(pool: BallPool, weight = 1, bounce = 0, mask = 0) {
    const b = pool.spawn(150, 305, { weight, bounce, gateMask: mask })!;
    b.py = 295; // 上から下へまたいだ状態
    b.px = 150;
    return b;
  }

  it('×4 を通ると玉が3個生まれて合計4個になる', () => {
    const pool = new BallPool(100);
    ballCrossing(pool);
    applyGates(pool, stage, 100);
    expect(pool.activeCount).toBe(4);
  });

  it('生まれた玉は gateMask が空（＝もう一度通ればまた増える）', () => {
    const pool = new BallPool(100);
    const parent = ballCrossing(pool);
    applyGates(pool, stage, 100);
    const children: number[] = [];
    pool.forEachActive((b) => {
      if (b !== parent) children.push(b.gateMask);
    });
    expect(children).toEqual([0, 0, 0]);
  });

  it('通った玉自身には印がつき、同じゲートでは二度と増えない', () => {
    const pool = new BallPool(100);
    const parent = ballCrossing(pool);
    applyGates(pool, stage, 100);
    expect(parent.gateMask).toBe(1); // id 0 のビット

    // 子は新品なので通れば増えてしまう。ここで見たいのは親だけなので、
    // 子は「またいでいない」状態に戻してから再実行する。
    pool.forEachActive((b) => {
      if (b === parent) return;
      b.px = b.x;
      b.py = b.y;
    });
    const after = pool.activeCount;
    parent.px = parent.x;
    parent.py = 295;
    parent.y = 305;
    applyGates(pool, stage, 100);
    expect(pool.activeCount).toBe(after); // 親はもう増やさない
  });

  it('生まれた玉は親の bounce を引き継ぐ（これが終了保証になる）', () => {
    const pool = new BallPool(100);
    const parent = ballCrossing(pool, 1, 3);
    applyGates(pool, stage, 100);
    pool.forEachActive((b) => {
      if (b !== parent) expect(b.bounce).toBe(3);
    });
  });

  it('生まれた玉は親と同じ weight を持つ', () => {
    const pool = new BallPool(100);
    const parent = ballCrossing(pool, 7);
    applyGates(pool, stage, 100);
    pool.forEachActive((b) => {
      if (b !== parent) expect(b.weight).toBe(7);
    });
  });

  it('玉の上限に達していたら、増やす代わりに weight を N 倍にする', () => {
    const pool = new BallPool(2);
    const b = ballCrossing(pool);
    pool.spawn(0, 0); // 埋めて空きをなくす
    applyGates(pool, stage, 2);
    expect(pool.activeCount).toBe(2); // 増えない
    expect(b.weight).toBe(4); // 重さで表現される
  });

  it('飽和して weight 化した玉は、そのゲートだけ済みで他は新品に戻る', () => {
    const pool = new BallPool(2);
    const b = ballCrossing(pool, 1, 0, 0b1110); // 他のゲートは通過済み
    pool.spawn(0, 0);
    applyGates(pool, stage, 2);
    expect(b.gateMask).toBe(0b0001); // 通ったゲートのみ立つ
  });

  it('applyGates は増えた総 weight を返す', () => {
    const pool = new BallPool(100);
    ballCrossing(pool, 5);
    const gained = applyGates(pool, stage, 100);
    expect(gained).toBe(15); // 5 が 20 になる = +15
  });

  it('飽和時も増えた総 weight は同じ（玉で増えても重さで増えても計上は等しい）', () => {
    const pool = new BallPool(2);
    ballCrossing(pool, 5);
    pool.spawn(0, 0);
    const gained = applyGates(pool, stage, 2);
    expect(gained).toBe(15);
  });

  it('x が範囲外の玉は増えない', () => {
    const narrow: Stage = {
      ...stage,
      gates: [{ id: 0, x1: 0, x2: 50, y: 300, multiplier: 4, capacity: 1e9, used: 0 }],
    };
    const pool = new BallPool(100);
    ballCrossing(pool);
    applyGates(pool, narrow, 100);
    expect(pool.activeCount).toBe(1);
  });

  it('ジャンプ台で戻って同じゲートを下から通った新品の玉も増える', () => {
    const pool = new BallPool(100);
    const b = pool.spawn(150, 295, { gateMask: 0 })!;
    b.py = 305; // 下から上へ
    b.px = 150;
    applyGates(pool, stage, 100);
    expect(pool.activeCount).toBe(4);
  });

  it('生まれた玉は親と完全に同じ位置には置かれない（重なって爆ぜないように）', () => {
    const pool = new BallPool(100);
    const parent = ballCrossing(pool);
    applyGates(pool, stage, 100);
    pool.forEachActive((b) => {
      if (b === parent) return;
      expect(b.x !== parent.x || b.y !== parent.y).toBe(true);
    });
  });

  it('使い切ったゲートは素通りする（増殖が永久に止まらないのを防ぐ）', () => {
    const limited: Stage = {
      ...stage,
      gates: [
        { id: 0, x1: 0, x2: 360, y: 300, multiplier: 4, capacity: 3, used: 0 },
      ],
    };
    const pool = new BallPool(100);
    ballCrossing(pool, 5); // weight 5 で capacity 3 を超える
    applyGates(pool, limited, 100);
    expect(limited.gates[0].used).toBe(5);

    // 2個目は素通りする
    const before = pool.activeCount;
    const b2 = pool.spawn(150, 305)!;
    b2.py = 295;
    b2.px = 150;
    applyGates(pool, limited, 100);
    expect(pool.activeCount).toBe(before + 1); // 生えた1個だけ、増殖なし
  });

  it('ゲートは通した weight の分だけ消費される', () => {
    const limited: Stage = {
      ...stage,
      gates: [
        { id: 0, x1: 0, x2: 360, y: 300, multiplier: 2, capacity: 100, used: 0 },
      ],
    };
    const pool = new BallPool(100);
    ballCrossing(pool, 7);
    applyGates(pool, limited, 100);
    expect(limited.gates[0].used).toBe(7);
  });

  /**
   * 1フレームで2つのゲートを跨いだ場合、親は両方で増えるが、
   * その場で生まれた子は「次のフレーム」まで判定されない（同フレーム内では連鎖しない）。
   * 実際のゲートは十分離れているので、子は次フレームで下のゲートを通って連鎖する。
   * 同フレーム連鎖を許すと、生成→判定→生成 が同一フレームで無限に回りうる。
   */
  it('1フレームで2つのゲートを跨ぐと、親が両方で1回ずつ増える', () => {
    const two: Stage = {
      ...stage,
      gates: [
        { id: 0, x1: 0, x2: 360, y: 300, multiplier: 2, capacity: 1e9, used: 0 },
        { id: 1, x1: 0, x2: 360, y: 302, multiplier: 2, capacity: 1e9, used: 0 },
      ],
    };
    const pool = new BallPool(100);
    const b = pool.spawn(150, 305)!;
    b.py = 295;
    b.px = 150;
    applyGates(pool, two, 100);
    expect(pool.activeCount).toBe(3); // 親 + 各ゲートで1個ずつ
    expect(b.gateMask).toBe(0b11); // 両方のゲートに印がつく
  });
});
