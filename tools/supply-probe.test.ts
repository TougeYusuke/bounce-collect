import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { createRng } from '../src/core/rng';
import { Session } from '../src/core/session';
import { buildStage } from '../src/core/stageDef';
import { rollStage } from '../src/core/stageRoll';
import { STAGES } from '../src/core/stages';
import { RUBRIC } from './stageRubric';

/**
 * 「盤面をずっと満杯に保つ」ためのツマミ探し。`npm run stages:supply`
 *
 * れいあ判定 2026-07-26:「玉が増えて盛り上がる感じがまだ物足りない」（3回目の同じ指摘）。
 * 過去2回はツマミを1個ずつ手で動かして見せていたが、
 * ⚠️ **持ち玉を増やす方向は 2026-07-25 の実測で潰れている**（盤面ピークは680で頭打ち・
 *    そのうえステージの「外れ」が消えて合格 9/9 → 1/9）。だから供給ではなく
 *    **滞留（出口の広さ・増える勢い）** の側を、組み合わせで総当たりして探す。
 *
 * ⚠️ 普段のテスト（`npm test`）には入れない。実際にゲームを何十回も通しで回すため。
 */

/** 最上段ゲートの高さ。ここより上に山が届いていれば「上まで詰まっている」 */
const HIGH_Y = 300;
/**
 * 「上まで詰まっている」とみなす個数。
 * ⚠️ 1〜4個だと**落下中の玉**を山と誤認する（R1は一度に4個しか配らない）。
 */
const HIGH_COUNT = 5;
/** 「満杯」とみなす玉数。⚠️ 実容量は約680（MAX_BALLS 850 には届かない・2026-07-25実測） */
const FULL_BALLS = 600;

interface Probe {
  peak: number;
  /** 玉が FULL_BALLS 以上いたフレームの割合 */
  full: number;
  /** 山が最上段ゲートより上まで届いていたフレームの割合 */
  high: number;
  score: number;
  secs: number;
}

/** ツマミの組み合わせ1つ */
interface Knobs {
  outlet: number;
  clearance: number;
  pushUps: number;
  grow: number;
}

const BASE: Knobs = { outlet: 3, clearance: 0.55, pushUps: 3, grow: 5 };

/**
 * ツマミを当てる。
 * ⚠️ `CONFIG` は `as const` だが実行時はただのオブジェクト。
 *    ⚠️ **Session/Stage を作る前に当てること**（読むのは構築時＝2026-07-25 に
 *    「モジュール読み込み時に固定されていて振っても効かない」罠を踏んでいる）。
 */
function apply(k: Knobs): void {
  const c = CONFIG as unknown as Record<string, number>;
  c.OUTLET_BALLS = k.outlet;
  c.GATE_SPAWN_CLEARANCE = k.clearance;
  c.MAX_PUSH_UPS = k.pushUps;
  c.SPAWN_GROW_FRAMES = k.grow;
}

function probe(defIndex: number, drop: number, seed = 1): Probe {
  const stage = buildStage(rollStage(STAGES[defIndex], createRng(seed)));
  const s = new Session(stage);
  s.setCupX(drop);
  s.start();
  let f = 0;
  let peak = 0;
  let fullFrames = 0;
  let highFrames = 0;
  for (; f < RUBRIC.MAX_FRAMES && !s.finished; f++) {
    s.update(1);
    const n = s.pool.activeCount;
    if (n > peak) peak = n;
    if (n >= FULL_BALLS) fullFrames++;
    let high = 0;
    for (const b of s.pool.balls) if (b.alive && b.y < HIGH_Y) high++;
    if (high >= HIGH_COUNT) highFrames++;
  }
  return { peak, full: fullFrames / f, high: highFrames / f, score: s.score, secs: f / 60 };
}

/** 見る型と、その型の「当たり」の位置（stage-report.txt の最高スコアの位置） */
const SAMPLES: { name: string; drop: number }[] = [
  { name: 'default', drop: 10 },
  { name: 'type-05-center-jump', drop: 95 },
  { name: 'type-08-compact', drop: 10 },
];

it('供給ツマミの総当たり', () => {
  const idx = SAMPLES.map((s) => STAGES.findIndex((d) => d.name === s.name));
  if (idx.some((i) => i < 0)) throw new Error(`型が見つからない: ${JSON.stringify(SAMPLES.map((s) => s.name))}`);

  const grid: Knobs[] = [];
  for (const outlet of [3, 2])
    for (const clearance of [0.55, 0.5])
      for (const pushUps of [3, 6])
        for (const grow of [5, 3]) grid.push({ outlet, clearance, pushUps, grow });

  const rows = [
    `出口 / 生む間隔 / 押上げ上限 / 育つF | 満杯率 上まで詰まった率 ピーク 点 秒（3型の平均）`,
    `満杯率＝玉が${FULL_BALLS}個以上いたフレームの割合 ／ 上まで詰まった率＝y<${HIGH_Y}に${HIGH_COUNT}個以上いた割合`,
    '',
  ];

  const results: { k: Knobs; full: number; high: number; peak: number; score: number; secs: number }[] = [];
  for (const k of grid) {
    apply(k);
    const ps = idx.map((i, n) => probe(i, SAMPLES[n].drop));
    const avg = (pick: (p: Probe) => number) => ps.reduce((a, p) => a + pick(p), 0) / ps.length;
    const r = {
      k,
      full: avg((p) => p.full),
      high: avg((p) => p.high),
      peak: avg((p) => p.peak),
      score: avg((p) => p.score),
      secs: avg((p) => p.secs),
    };
    results.push(r);
    const base = k.outlet === BASE.outlet && k.clearance === BASE.clearance
      && k.pushUps === BASE.pushUps && k.grow === BASE.grow;
    rows.push(
      `${k.outlet} / ${k.clearance} / ${k.pushUps} / ${k.grow}${base ? ' ←いま' : '    '} | ` +
        `${(r.full * 100).toFixed(0).padStart(3)}%  ${(r.high * 100).toFixed(0).padStart(3)}%  ` +
        `${r.peak.toFixed(0).padStart(4)}  ${r.score.toFixed(0).padStart(5)}  ${r.secs.toFixed(0).padStart(3)}秒`,
    );
  }

  // ⚠️ 秒が伸びすぎたものは採用できない（合格条件 SECS_MAX=95・R2の配り切りも伸びる）
  const ok = results.filter((r) => r.secs <= RUBRIC.SECS_MAX && r.score <= RUBRIC.BEST_MAX);
  const rank = [...ok].sort((a, b) => b.full + b.high - (a.full + a.high));
  rows.push('', `※ ${RUBRIC.SECS_MAX}秒以内かつ${RUBRIC.BEST_MAX}点以内に収まった ${ok.length}/${grid.length} 通りの上位3つ`);
  for (const r of rank.slice(0, 3)) {
    rows.push(
      `  出口${r.k.outlet} 間隔${r.k.clearance} 押上げ${r.k.pushUps} 育つ${r.k.grow}F ` +
        `→ 満杯${(r.full * 100).toFixed(0)}% 上まで${(r.high * 100).toFixed(0)}% ${r.secs.toFixed(0)}秒`,
    );
  }

  apply(BASE); // ⚠️ 触ったCONFIGを戻す（同じプロセスで他のテストが走る時に効いてしまう）
  const text = rows.join('\n');
  writeFileSync('supply-report.txt', text, 'utf-8');
  console.log(text);
}, 1_800_000);
