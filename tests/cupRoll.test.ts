import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { cupPourDirection, cupRollFrames, cupWorldToLocal } from '../src/core/cupPose';
import type { Ball } from '../src/core/ball';
import { Session } from '../src/core/session';

/**
 * 「カップの**底になる面**に沿って口まで進み、縁を離れたら落ちる」を数値で見張る。
 *
 * ⚠️ 見た目の判定はスクショではなく**軌跡**で行う。「転がってる気がする」では詰められないが、
 *    進む向きと局所座標なら機械的に測れる（2026-07-25 実測でこちらの方が軽くて確実だった）。
 * ⚠️ 傾きは Session が持つので、このテストは**実機と同じ姿勢**を見ている
 *    （以前は main.ts が傾きを持っていて、テストは直立のカップしか見られなかった）。
 */

/** 最初の玉が出るまで進める。出たフレームの傾きも一緒に返す */
function pourFirst(s: Session): { ball: Ball; tilt: number } {
  s.start();
  for (let i = 0; i < 120 && s.supplied === 0; i++) s.update(1);
  const ball = s.pool.balls.find((b) => b.alive);
  if (!ball) throw new Error('玉が出なかった');
  return { ball, tilt: s.cupTilt };
}

describe('カップの底面に沿った転がり', () => {
  it('傾き切るまで注がない（直立のまま出すと玉が上へ飛ぶ）', () => {
    const s = new Session();
    s.start();
    s.update(1);
    expect(s.supplied).toBe(0); // タップした次のフレームではまだ傾いていない

    const { tilt } = pourFirst(s);
    expect(tilt).toBeGreaterThanOrEqual(CONFIG.CUP_POUR_TILT * CONFIG.CUP_POUR_READY);
  });

  it('⚠️ 真横ではなく「口の向き」へ進む＝横倒し時に底になる面に沿う', () => {
    const s = new Session();
    const { ball, tilt } = pourFirst(s);
    const vx = ball.x - ball.px;
    const vy = ball.y - ball.py;
    const v = Math.hypot(vx, vy);
    const dir = cupPourDirection(tilt);

    // 進む向きが口の向きと一致している（内積≒1）
    expect((vx / v) * dir.x + (vy / v) * dir.y).toBeGreaterThan(0.999);
    // ⚠️ 真横に流していた頃の回帰止め。傾いたカップの底面は口へ向かって上るので、
    //    縦成分が 0 なら「面から浮いて真横に発射されている」ことになる（れいあ指摘 2026-07-25）
    expect(vy).toBeLessThan(0);
  });

  it('転がっている間は加速しない（重力を受けない）', () => {
    const s = new Session();
    const { ball } = pourFirst(s);
    const speedAt = () => Math.hypot(ball.x - ball.px, ball.y - ball.py);
    const first = speedAt();

    // ⚠️ 最後の1フレームは縁を離れる処理（勢いを捨てる）が入るので、その手前まで見る
    for (let i = 1; i < cupRollFrames() - 1; i++) {
      s.update(1);
      // 空気抵抗ぶんしか落ちない（重力が乗ると 0.35/フレームで増える）
      expect(speedAt()).toBeCloseTo(first * CONFIG.DAMPING ** i, 1);
    }
  });

  it('道を外れずに進み、口の縁に着いたところで落下に移る', () => {
    const s = new Session();
    const { ball, tilt } = pourFirst(s);
    const at = () => cupWorldToLocal(s.cupX, tilt, ball.x, ball.y);
    expect(at().x).toBeCloseTo(CONFIG.CUP_ROLL_LANE_X, 0);

    for (let i = 1; i < cupRollFrames(); i++) {
      s.update(1);
      // 道（底面）から外れない＝ローカルXは変わらない
      expect(at().x).toBeCloseTo(CONFIG.CUP_ROLL_LANE_X, 0);
    }
    expect(ball.rollFrames).toBe(0);
    // ⚠️ ここが「玉が見え始める場所」。深いとバケツの陰から湧いて見え、外すぎると宙から落ちる。
    //    空気抵抗ぶんだけ手前で止まるので、縁のまわり ±2px を許す。
    expect(Math.abs(at().y - CONFIG.CUP_ROLL_EXIT_Y)).toBeLessThan(2);
  });

  it('縁を離れたら横へ飛ばずに落ちる', () => {
    const s = new Session();
    const { ball } = pourFirst(s);
    const rolling = Math.abs(ball.x - ball.px);
    for (let i = 1; i < cupRollFrames(); i++) s.update(1);

    // 転がっていた勢いは縁で捨てる（残すと弧を描いて飛ぶ＝「発射」に戻る）
    expect(Math.abs(ball.x - ball.px)).toBeLessThan(rolling * 0.5);
    s.update(1);
    // 縦は重力で増えていく
    expect(ball.y - ball.py).toBeGreaterThan(0);
  });
});

describe('なぞった場所に玉が落ちる', () => {
  /** その位置を狙って、実際に玉が落ち始めた x を返す */
  function dropAt(target: number): number {
    const s = new Session();
    s.setCupX(target);
    const { ball } = pourFirst(s);
    for (let i = 1; i < cupRollFrames(); i++) s.update(1);
    return ball.x; // 縁を離れて落下に移る瞬間の位置
  }

  it('⚠️ 盤面の端から端まで届く（左端に落とせなかった・れいあ指摘 2026-07-25）', () => {
    // ⚠️ 玉は口の**縁**から出るのでカップ中心には落ちない。右へ注ぐ一方通行だと
    //    左端に落とすにはカップを画面外へ出すしかなく、x=72 より左に落とせなかった。
    for (const target of [10, 90, 180, 270, 350]) {
      expect(Math.abs(dropAt(target) - target)).toBeLessThan(6);
    }
  });

  /** 縁を離れて最初の1フレームの横向きの速さ（ここで初めて壁の判定が効く） */
  function dropVxAt(target: number): number {
    const s = new Session();
    s.setCupX(target);
    const { ball } = pourFirst(s);
    for (let i = 1; i < cupRollFrames(); i++) s.update(1);
    s.update(1);
    return ball.x - ball.px;
  }

  it('⚠️ 端ギリギリを狙っても横に飛ばない（2026-07-26 れいあ指摘）', () => {
    // 🔑 玉は**半径ぶんの大きさを持つ**。落ち始める場所を壁ぎわ(0や360)まで許すと、
    //    生まれた瞬間から壁にめり込んでいる状態になる。
    //    Verlet では位置を押し戻した量がそのまま速度になるので、
    //    押し戻されたぶん**中央へ向かって飛ぶ**（実測: 狙い0 で +8.38px/フレーム）。
    for (const target of [0, 2, 4, 356, 358, 360]) {
      expect(Math.abs(dropVxAt(target))).toBeLessThan(1);
    }
  });

  it('⚠️ 端を狙った玉は「壁に接する限界」に落ちる（半径ぶん内側が限界）', () => {
    const r = CONFIG.BALL_RADIUS;
    // 狙いが壁の外でも、玉の**縁**が壁に接する所までしか行けない＝そこが限界
    expect(dropAt(0)).toBeCloseTo(r, 0);
    expect(dropAt(360)).toBeCloseTo(CONFIG.BOARD_WIDTH - r, 0);
  });

  it('⚠️ 左端を狙うとカップは画面から見切れる（それでよい・れいあ裁定 2026-07-25）', () => {
    // 玉は口の縁から出るので、カップ本体は指より左に居る。
    // ⚠️ カップを画面内に収める形に戻すと左端に落とせなくなる。
    //    左右で注ぐ向きを入れ替える案は「挙動が気持ち悪い」で不採用。
    const s = new Session();
    s.setCupX(10);
    expect(s.cupX).toBeLessThan(0);
  });

  it('⚠️ R2で端を狙っても、一番外の列が壁の外に湧かない（2026-07-26 れいあ指摘）', () => {
    // R2は口の幅方向に何列も並べて落とすので、R1（玉1個）より広い余白が要る。
    // ⚠️ 見るのは**最初の放出**（盤面が空＝玉同士の押し合いが無いので、
    //    横向きの速さが出たらそれは壁に押し戻されたぶんしかない）。
    for (const target of [0, 360]) {
      const s = new Session(undefined, { mode: 'r2', supplyTotal: 400, maxBalls: 400 });
      s.setCupX(target);
      s.start();
      for (let f = 0; f < 90 && s.supplied === 0; f++) {
        s.setCupX(target);
        s.update(1);
      }
      expect(s.supplied).toBeGreaterThan(0);
      let peak = 0;
      s.pool.forEachActive((b) => {
        peak = Math.max(peak, Math.abs(b.x - b.px));
      });
      expect(peak).toBeLessThan(1);
    }
  });

  it('R2はズレ無し（真下へ注ぐので、なぞった所の真下に落ちる）', () => {
    const s = new Session(undefined, { mode: 'r2', supplyTotal: 50 });
    s.setCupX(40);
    expect(s.cupX).toBe(40);
  });
});

describe('R2は転がさずひっくり返して落とす', () => {
  it('⚠️ R2の玉は道に乗せない（大量に配るので偏りが盤面に出る）', () => {
    const s = new Session(undefined, { mode: 'r2', supplyTotal: 50 });
    const { ball } = pourFirst(s);
    expect(ball.rollFrames).toBe(0);
  });

  it('R2は真下を向くまで傾く（＝注ぐ向きが横に偏らない）', () => {
    const s = new Session(undefined, { mode: 'r2', supplyTotal: 50 });
    const { tilt } = pourFirst(s);
    const dir = cupPourDirection(tilt);
    expect(dir.y).toBeGreaterThan(0.98); // ほぼ真下
    expect(Math.abs(dir.x)).toBeLessThan(0.2);
  });

  it('落ちる向きも真下（横の初速を付けない）', () => {
    const s = new Session(undefined, { mode: 'r2', supplyTotal: 50 });
    const { ball } = pourFirst(s);
    expect(ball.x - ball.px).toBeCloseTo(0, 5);
    expect(ball.y - ball.py).toBeGreaterThan(0);
  });
});
