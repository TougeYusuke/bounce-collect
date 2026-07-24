import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { Session } from '../src/core/session';

/**
 * 「カップの中から横に転がって、縁を越えたら落ちる」を数値で見張る。
 * ⚠️ 見た目の判定はスクショではなく**軌跡**で行う。
 *    「転がってる気がする」では詰められないが、縦の移動量なら機械的に測れる。
 */
describe('カップからの転がり', () => {
  it('出た直後は真横に進み、縁を越えてから落ち始める', () => {
    const s = new Session();
    s.start();
    s.update(1);
    const b = s.pool.balls.find((x) => x.alive)!;

    let rolled = 0; // 縦に落ちずに横へ進んだフレーム数
    let dropStartedAt = -1;
    for (let i = 0; i < 14; i++) {
      const py = b.y;
      s.update(1);
      const dy = b.y - py;
      if (dy === 0) rolled++;
      else if (dropStartedAt < 0) dropStartedAt = i;
    }

    expect(rolled).toBeGreaterThan(3); // 転がる区間がある
    expect(dropStartedAt).toBeGreaterThan(0); // 出た瞬間には落ちない
    // ⚠️ 落ち始める時にはカップの縁（半幅の目安 29px）を越えていること。
    //    越える前に落ちると「カップの下から出てくる」ように見える（れいあ指摘）
    expect(b.x - s.cupX).toBeGreaterThan(29);
  });

  it('⚠️ R2では転がらない（大量に配るので盤面が右へ偏る）', () => {
    const s = new Session(undefined, { mode: 'r2', supplyTotal: 50 });
    s.start();
    for (let i = 0; i < CONFIG.R2_START_DELAY_FRAMES + 2; i++) s.update(1);
    const b = s.pool.balls.find((x) => x.alive)!;
    expect(b.rollFrames).toBe(0);
  });
});
