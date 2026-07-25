import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { Session } from '../src/core/session';
import { createFixedStage } from '../src/core/stage';

/** 指定フレーム進める小道具 */
function run(s: Session, frames: number): void {
  for (let i = 0; i < frames; i++) s.update(1);
}

/**
 * 最初の1回ぶんが出るまで進める。
 * ⚠️ タップの次のフレームには出ない。バケツは**傾き切ってから注ぐ**（`CUP_POUR_READY`）ので、
 *    約19フレームの傾き待ちが入る（2026-07-25。直立のまま注ぐと玉が上へ飛ぶため）。
 */
function pour(s: Session): void {
  s.start();
  for (let i = 0; i < 120 && s.supplied === 0; i++) s.update(1);
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

  it('⚠️ 重い玉は作らない（出した数だけ残数が減る）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    pour(s);
    expect(s.supplied).toBeGreaterThan(0);
    // 個数とスコアを一致させるため、出した数と残数の合計は常に総量
    expect(s.supplied + s.remaining).toBe(10_000);
    s.pool.forEachActive((b) => {
      expect(b.weight).toBe(1);
    });
  });

  it('start() するまでは1個も出ない（R2もタップ待ち）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    run(s, 120);
    expect(s.supplied).toBe(0);
    pour(s);
    expect(s.supplied).toBeGreaterThan(0);
  });

  it('⚠️ 傾き切るまで注がない（直立のまま注ぐと口が真上を向いていて玉が上へ飛ぶ）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    s.start();
    run(s, 1);
    expect(s.supplied).toBe(0);
    pour(s);
    expect(s.cupTilt).toBeGreaterThanOrEqual(CONFIG.CUP_DUMP_TILT * CONFIG.CUP_POUR_READY);
  });

  it('⚠️ R2はまとめて出す（バケツをひっくり返して大量に流す・2026-07-25 れいあ要望）', () => {
    // ⚠️ これは「R2も1個ずつ出す」という 2026-07-24 の決定を**れいあ本人が上書き**したもの。
    //    1個ずつだと1900個で約5分かかる（重い玉を作らない方針は据え置きなので、量で調整する）。
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    expect(s.dumpCount).toBeGreaterThan(1);
    pour(s);
    expect(s.supplied).toBe(s.dumpCount);
  });

  it('持ち玉が少ない時はまとめない（R1と同じ1個ずつ）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 30 });
    expect(s.dumpCount).toBe(1);
  });

  it('⚠️ 口の幅の中から湧く（バケツの外の宙から湧かない）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    pour(s);
    // ⚠️ 傾き切る手前で注ぎ始める（`CUP_POUR_READY`）ぶん数pxはみ出す。傾き切れば収まる。
    //    ここで捕まえたいのは「列を増やしすぎて口の外から湧く」＝桁で外れる壊れ方
    const limit = CONFIG.CUP_WIDTH / 2 - CONFIG.BALL_RADIUS + CONFIG.BALL_RADIUS / 2;
    s.pool.forEachActive((b) => {
      expect(Math.abs(b.x - s.cupX)).toBeLessThanOrEqual(limit);
    });
  });

  it('⚠️ 左右に偏らない（偏ると盤面が片側に寄って放流が来ない）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    pour(s);
    let sum = 0;
    let n = 0;
    s.pool.forEachActive((b) => {
      sum += b.x - s.cupX;
      n++;
    });
    // ⚠️ 傾き切る手前で注ぎ始める（`CUP_POUR_READY`）ので数pxはズレる。
    //    玉の半径より小さければ「偏り」ではない。桁で外れたら注ぐ向きが斜めになっている
    expect(Math.abs(sum / n)).toBeLessThan(CONFIG.BALL_RADIUS / 2);
  });

  it('⚠️ 増やした数がそのまま出る（口の下が渋滞していない）', () => {
    // ⚠️ ここが落ちたら `R2_DUMP_MAX` を上げても**実際の量は増えていない**。
    //    前の回が口の下に居残ると「湧く場所が埋まっている」で弾かれる（2026-07-25 実測）。
    // ⚠️ 立ち上がりの数秒は見ない。ジャンプ台で打ち上がった玉が口のあたりを通るので
    //    一時的に湧けない（実測: 2〜4秒だけ 24〜47個/秒 に落ち、その後 60個/秒 に戻る）。
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    pour(s);
    run(s, 60 * 5);
    const before = s.supplied;
    run(s, 60 * 3);
    const theory = (s.dumpCount / s.supplyInterval) * 60 * 3;
    // 実測 85〜99%。盤面が埋まってくると口の下も混むので、理論値ちょうどには届かない。
    // ⚠️ ここで捕まえたいのは「増やした数の半分も出ていない」レベルの詰まり
    expect(s.supplied - before).toBeGreaterThan(theory * 0.85);
  }, 60_000);

  it('⚠️ 大量でも配り切りが数分にならない（1個ずつだと1900個で約5分）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 1900 });
    const frames = Math.ceil(s.supplyBalls / s.dumpCount) * s.supplyInterval;
    const oneByOne = s.supplyBalls * s.supplyInterval; // 1個ずつだとこれだけかかる
    // まとめて出すぶん、まとめた数ぶん速い（実測: 1900個の配り切りが 190秒 → 35秒）
    expect(frames).toBeLessThanOrEqual(oneByOne / 5);
  });

  it('R1は1個ずつ（まとめない）', () => {
    const s = new Session();
    expect(s.dumpCount).toBe(1);
    pour(s);
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
