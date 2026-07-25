import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { STAGES } from '../src/core/stages';
import { RUBRIC, judge, line } from './stageRubric';

/**
 * いまある型を全部採点する。`npm run stages:check`
 * ⚠️ 普段のテスト（`npm test`）には入れない。1回3分ほどかかるため。
 */
it('全ステージの採点', () => {
  const rows = [
    `落とす位置 ${RUBRIC.DROPS.join(' / ')}`,
    `合格条件: 当たり${RUBRIC.BEST_MIN}〜${RUBRIC.BEST_MAX}点 / ${RUBRIC.SECS_MIN}〜${RUBRIC.SECS_MAX}秒 / 差${RUBRIC.SPREAD_MIN}倍以上 / 狙える場所${RUBRIC.GOOD_COUNT_MIN}か所以上`,
    '',
  ];
  let ok = 0;
  for (const def of STAGES) {
    const r = judge(def);
    if (r.pass) ok++;
    rows.push(line(r));
  }
  rows.push('', `合格 ${ok} / ${STAGES.length}`);
  const text = rows.join('\n');
  writeFileSync('stage-report.txt', text, 'utf-8');
  console.log(text);
}, 1_800_000);
