import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { Session } from '../src/core/session';
import { createFixedStage } from '../src/core/stage';

/** 指定フレーム進める小道具 */
function run(s: Session, frames: number): void {
  for (let i = 0; i < frames; i++) s.update(1);
}

describe('R2モードの供給', () => {
  it('mode を省くと R1（既定）', () => {
    expect(new Session().mode).toBe('r1');
  });

  it('R2は supplyTotal を weight にまとめて配る', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    // 配る玉数は上限で頭打ち、weight は切り上げ
    expect(s.supplyBalls).toBe(CONFIG.R2_SUPPLY_BALLS);
    expect(s.supplyWeight).toBe(Math.ceil(10_000 / CONFIG.R2_SUPPLY_BALLS));
    // 供給の合計は元の数以上（切り上げのぶん上回る）
    expect(s.supplyBalls * s.supplyWeight).toBeGreaterThanOrEqual(10_000);
  });

  it('供給量が上限より小さいときは weight 1 でその数だけ配る', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 30 });
    expect(s.supplyBalls).toBe(30);
    expect(s.supplyWeight).toBe(1);
  });

  it('R2で出てくる玉は weight を持っている', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    s.start();
    run(s, 40);
    let seen = 0;
    s.pool.forEachActive((b) => {
      if (b.weight >= s.supplyWeight) seen++;
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('R2は1回に複数個を横に並べて出す（縦の間隔は詰められないため）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    s.start();
    // supplyTimer は「開始直後に出す」初期値なので、1フレームでちょうど1回ぶん出る
    run(s, 1);
    expect(s.supplied).toBe(CONFIG.R2_SUPPLY_PER_TICK);

    // 同じ高さに並んでいて、横は最低でも直径ぶん離れている
    const xs: number[] = [];
    s.pool.forEachActive((b) => xs.push(b.x));
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CONFIG.BALL_RADIUS * 2);
    }
  });

  it('R1の供給は1個ずつのまま（既存の挙動を変えない）', () => {
    const s = new Session();
    s.start();
    run(s, 1);
    expect(s.supplied).toBe(1);
  });
});

/** 放流するか、時間切れで終わるまで回す */
function runUntil(s: Session, cond: (s: Session) => boolean): void {
  for (let i = 0; i < CONFIG.ROUND_TIME_LIMIT + 60 && !cond(s); i++) s.update(1);
}

describe('R2の溜めと放流', () => {
  it('放流前は玉が落ちてもスコアが増えない', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    s.start();
    run(s, 120);
    expect(s.released).toBe(false);
    expect(s.score).toBe(0);
  });

  it('放流すると傾斜板が物理からも見た目からも消える', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 400_000 });
    const wedges = [...(s.stage.wedges ?? [])];
    expect(wedges.length).toBeGreaterThan(0);

    s.start();
    runUntil(s, (x) => x.released);
    expect(s.released).toBe(true);
    // 物理の背止め
    expect(s.stage.wedges?.length ?? 0).toBe(0);
    // ⚠️ 描画と当たり判定が見ている線分側からも消えていること
    //    （片方だけだと「見えない板に載る」か「見えている板をすり抜ける」になる）
    for (const w of wedges) {
      expect(s.stage.segments).not.toContain(w);
      expect(s.world.segments).not.toContain(w);
    }
    // 中央の仕切りは残る（抜くのは傾斜板だけ）
    expect(s.stage.segments.length).toBeGreaterThan(0);
  });

  it('放流後は回収がスコアになり、ラウンドが終わる', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 400_000 });
    s.start();
    runUntil(s, (x) => x.finished);
    expect(s.finished).toBe(true);
    expect(s.score).toBeGreaterThan(0);
  });

  it('R1は放流の概念を持たない（常にfalse・回収は即スコア）', () => {
    const s = new Session();
    s.start();
    runUntil(s, (x) => x.finished);
    expect(s.released).toBe(false);
    expect(s.score).toBeGreaterThan(0);
  });
});
