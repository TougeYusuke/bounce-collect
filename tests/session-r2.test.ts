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

  it('⚠️ R1で集めた個数をそのまま配る（上限で頭打ちにしない）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    expect(s.supplyBalls).toBe(10_000);
    // コップの残数も個数そのまま（総量と一致する）
    expect(s.remaining).toBe(10_000);
  });

  it('少ないときもその数だけ配る', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 30 });
    expect(s.supplyBalls).toBe(30);
    expect(s.remaining).toBe(30);
  });

  it('⚠️ 重い玉は作らない（1個出したら残数はちょうど1減る）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    s.start();
    run(s, CONFIG.R2_START_DELAY_FRAMES + 1);
    expect(s.supplied).toBe(1);
    expect(s.remaining).toBe(9_999);
    s.pool.forEachActive((b) => {
      expect(b.weight).toBe(1);
    });
  });

  it('start() するまでは1個も出ない（R2もタップ待ち）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    run(s, 120);
    expect(s.supplied).toBe(0);
    s.start();
    run(s, 2);
    expect(s.supplied).toBeGreaterThan(0);
  });

  it('R2も1個ずつ出す（横並びで複数同時に出さない）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    s.start();
    run(s, CONFIG.R2_START_DELAY_FRAMES + 1);
    expect(s.supplied).toBe(1);
  });

  it('R1の供給も1個ずつ（待ちは無し）', () => {
    const s = new Session();
    s.start();
    run(s, 1);
    expect(s.supplied).toBe(1);
  });
});

describe('供給間隔は持ち玉の数で決まる', () => {
  it('持ち玉が少ないほどゆっくり出す', () => {
    const few = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 20 });
    const many = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 999_999 });
    expect(few.supplyBalls).toBeLessThan(many.supplyBalls);
    expect(few.supplyInterval).toBeGreaterThan(many.supplyInterval);
  });

  it('⚠️ 物理の下限（玉が1直径落ちる時間）を割らない', () => {
    const many = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 999_999 });
    expect(many.supplyInterval).toBeGreaterThanOrEqual(CONFIG.SUPPLY_INTERVAL_MIN);
  });

  it('上限を超えてゆっくりにはならない', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 1 });
    expect(s.supplyInterval).toBeLessThanOrEqual(CONFIG.SUPPLY_INTERVAL_MAX);
  });
});

/** 放流するか、時間切れで終わるまで回す */
function runUntil(s: Session, cond: (s: Session) => boolean): void {
  for (let i = 0; i < CONFIG.ROUND_TIME_LIMIT + 60 && !cond(s); i++) s.update(1);
}

describe('R2の回収と板抜き', () => {
  it('⚠️ R2も出口から出た玉は最初からスコアになる（溜め込むラウンドではない）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10 });
    s.start();
    // 板が抜けるより前（スコアが RELEASE_SCORE 未満）でも回収される
    runUntil(s, (x) => x.score > 0);
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThan(CONFIG.RELEASE_SCORE);
    expect(s.released).toBe(false);
  }, 60_000);

  it('スコアが RELEASE_SCORE を超えると詰まり防止に板が抜ける', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 400_000 });
    s.start();
    runUntil(s, (x) => x.released);
    expect(s.released).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(CONFIG.RELEASE_SCORE);
  }, 60_000);

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
    // ⚠️ 重い玉を廃止して1個1点になったぶん、放流まで回すフレームが増えた（既定5秒では足りない）
  }, 60_000);

  it('配り切ったあとはラウンドが終わる（はまったまま残っても打ち切る）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 200 });
    s.start();
    runUntil(s, (x) => x.finished);
    expect(s.finished).toBe(true);
    expect(s.score).toBeGreaterThan(0);
  }, 60_000);

  it('⚠️ 時間ではなく「回収が進まなくなったか」で打ち切る', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 5 });
    s.start();
    runUntil(s, (x) => x.finished);
    expect(s.finished).toBe(true);
    // 5個しか配らないので、昔の時間切れ（ROUND_TIME_LIMIT）よりずっと早く終わる
    expect(s.elapsed).toBeLessThan(CONFIG.ROUND_TIME_LIMIT);
    // 打ち切り時は残った玉も拾ってスコアにする
    expect(s.score).toBeGreaterThan(0);
  }, 60_000);

  it('R1は放流の概念を持たない（常にfalse・回収は即スコア）', () => {
    const s = new Session();
    s.start();
    runUntil(s, (x) => x.finished);
    expect(s.released).toBe(false);
    expect(s.score).toBeGreaterThan(0);
  }, 60_000);
});
