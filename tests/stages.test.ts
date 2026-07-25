import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { cupSpawnPosition } from '../src/core/cupPose';
import { createRng } from '../src/core/rng';
import { buildStage } from '../src/core/stageDef';
import { STAGES, pickStageDef } from '../src/core/stages';

describe('遊べる型', () => {
  it('⚠️ 保存が1つも無くても最低1つある（空だとゲームが始まらない）', () => {
    expect(STAGES.length).toBeGreaterThan(0);
  });

  it('どの型もそのまま組み立てられる', () => {
    for (const def of STAGES) {
      expect(() => buildStage(def)).not.toThrow();
    }
  });

  it('選ばれるのは必ずリストの中の型（配置は生成しない）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(STAGES).toContain(pickStageDef(createRng(seed)));
    }
  });

  it('同じ種なら同じ型が選ばれる', () => {
    expect(pickStageDef(createRng(5))).toBe(pickStageDef(createRng(5)));
  });
});

describe('置いていい高さ', () => {
  /**
   * R2でバケツをひっくり返すと、口は `CUP_Y` からずっと下まで移動する。
   * ⚠️ その下にバケツの絵の胴が続くので、口のすぐ下に部品を置くと
   *    「バケツの中から線やゲートが生えている」ように見える（2026-07-25 れいあ指摘の違和感）。
   */
  const mouthY = cupSpawnPosition(CONFIG.BOARD_WIDTH / 2, CONFIG.CUP_DUMP_TILT).y;
  const topLimit = mouthY + 45;

  it('⚠️ ひっくり返したバケツに部品が食い込まない', () => {
    for (const def of STAGES) {
      for (const g of def.gates) {
        expect(g.y).toBeGreaterThan(topLimit);
      }
      for (const d of def.dividers) {
        expect(Math.min(d.y1, d.y2)).toBeGreaterThan(topLimit);
      }
    }
  });

  it('⚠️ ジャンプ台は最下段に1台だけ（複数あると跳ね上げ→再増殖が長引く）', () => {
    for (const def of STAGES) {
      expect(def.jumpers.length).toBeLessThanOrEqual(1);
      for (const j of def.jumpers) {
        expect(j.y).toBeGreaterThan(CONFIG.JUMPER_ZONE_TOP);
        // 漏斗に埋まると玉が乗る前に流れてしまう
        expect(j.y).toBeLessThan(CONFIG.BOARD_HEIGHT - CONFIG.FUNNEL_BOTTOM_MARGIN - 60);
      }
    }
  });

  it('⚠️ ゲートは壁までいっぱいに置く（壁際に隙間があると貼り付いた玉が素通りする）', () => {
    for (const def of STAGES) {
      const left = Math.min(...def.gates.map((g) => g.x1));
      const right = Math.max(...def.gates.map((g) => g.x2));
      expect(left).toBeLessThanOrEqual(CONFIG.BALL_RADIUS);
      expect(right).toBeGreaterThanOrEqual(CONFIG.BOARD_WIDTH - CONFIG.BALL_RADIUS);
    }
  });
});
