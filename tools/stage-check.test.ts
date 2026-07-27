import { appendFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { STAGES } from '../src/core/stages';
import { RUBRIC, judge, line } from './stageRubric';

/**
 * いまある型を全部採点する。`npm run stages:check`
 * ⚠️ 普段のテスト（`npm test`）には入れない。1回15分ほどかかるため（seeds=6）。
 * ⚠️ **1型ごとに追記する**（2026-07-27）。最後に一括で書いていた頃は、実行が途中で
 *    打ち切られると結果が1行も残らなかった。長く回る道具なので途中でも読める形にする。
 */
const OUT = 'stage-report.txt';

it('全ステージの採点', () => {
  const header = [
    `落とす位置 ${RUBRIC.DROPS.join(' / ')}`,
    `抽選ならし ${RUBRIC.SEEDS}回`,
    `合格条件: 当たり${RUBRIC.BEST_MIN}〜${RUBRIC.BEST_MAX}点 / ${RUBRIC.SECS_MIN}〜${RUBRIC.SECS_MAX}秒 / 差${RUBRIC.SPREAD_MIN}倍以上 / 狙える場所${RUBRIC.GOOD_COUNT_MIN}か所以上`,
    '',
    '',
  ].join('\n');
  writeFileSync(OUT, header, 'utf-8');
  let ok = 0;
  for (const def of STAGES) {
    const r = judge(def);
    if (r.pass) ok++;
    appendFileSync(OUT, `${line(r)}\n`, 'utf-8');
  }
  appendFileSync(OUT, `\n合格 ${ok} / ${STAGES.length}\n`, 'utf-8');
}, 3_600_000);
