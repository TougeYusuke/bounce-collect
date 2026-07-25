import { CONFIG } from '../src/core/config';
import { cupLocalToWorld } from '../src/core/cupPose';
import { createRng } from '../src/core/rng';
import { Session } from '../src/core/session';
import { buildStage, type StageDef } from '../src/core/stageDef';
import { rollStage } from '../src/core/stageRoll';

/**
 * ステージの合否を**機械で**決める装置。
 *
 * 狙い（2026-07-25 れいあ指定）: 「最終的にはリアたちだけでステージを量産したい。
 * れいあは細かい調整だけ」。そのために要るのは生成より先に**判定**。
 * ⚠️ れいあに遊ばせて判定させない。ここを通ったものだけ見せる。
 * ⚠️ これは**れいあの手間を減らすための内部ツール**。汎用のステージ評価器を作るのが目的ではない。
 */
export const RUBRIC = {
  /**
   * 見る「玉が落ち始める位置」。盤面は横360。
   * ⚠️ **端を含めること**（2026-07-25 に左端も落とせるようになった）。端が死んでいる型を見逃す。
   */
  DROPS: [10, 95, 180, 265, 350],
  /** 倍率の抽選違いを何回ならすか。⚠️ 1だと当たり倍率を引いたかどうかで結果がぶれる */
  SEEDS: 2,
  /** 当たりの位置でこれだけ稼げること（低いと「増える気持ちよさ」が出ない） */
  BEST_MIN: 1000,
  /**
   * 稼ぎすぎもNG。⚠️ 上限を決めているのは**R2の配り切り時間**（口の幅と落下速度で 60個/秒が物理的な天井）。
   *    3200個 ≒ 53秒。ここを上げるならR2の配り方から先に見直すこと。
   * ⚠️ 2600 → 3200 に引き上げ（2026-07-25）。「詰まった山が盛り返す」を入れて玉数が増えたため。
   *    上限を据え置くと、盛り返しが効いた型が軒並み不可になってしまう。
   */
  BEST_MAX: 3200,
  /** 当たりの位置での通し時間（秒） */
  SECS_MIN: 30,
  SECS_MAX: 95,
  /**
   * 最高 ÷ 最低。
   * 🔑 **これが「適当に落とすとスコアが悪くなる」の担保**（れいあ設計指定 2026-07-25）。
   *    ここが 1.x の型は、どこに落としても同じ＝なぞって狙う意味が無い。
   */
  SPREAD_MIN: 2.0,
  /** 「狙える場所」の下限スコアと、最低いくつ要るか（少ないと運ゲーになる） */
  GOOD_MIN: 500,
  GOOD_COUNT_MIN: 3,
  /** 1回の判定で回す最大フレーム（保険） */
  MAX_FRAMES: 60 * 60 * 6,
} as const;

/**
 * その位置に落としたい時に、なぞるべきx。
 * ⚠️ `setCupX` は「**玉を落としたい場所**」を受け取るので、いまはそのまま渡すだけ
 *    （2026-07-25 に「なぞった所に落ちる」へ直した）。
 */
export function tapForDrop(drop: number): number {
  return drop;
}

export interface StageReport {
  name: string;
  /** RUBRIC.DROPS と同じ並びのスコア */
  scores: number[];
  /** 同じ並びの通し秒 */
  secs: number[];
  best: number;
  worst: number;
  /** 最高 ÷ 最低 */
  spread: number;
  /** 最高スコアが出た位置での通し秒 */
  bestSecs: number;
  pass: boolean;
  /** 落ちた理由（日本語）。通れば空 */
  ng: string[];
}

/** 1回だけ通しで回す */
function runOnce(def: StageDef, seed: number, drop: number): { score: number; secs: number } {
  const stage = buildStage(rollStage(def, createRng(seed)));
  const s = new Session(stage);
  s.setCupX(tapForDrop(drop));
  s.start();
  let f = 0;
  for (; f < RUBRIC.MAX_FRAMES && !s.finished; f++) s.update(1);
  return { score: s.score, secs: f / 60 };
}

/** 合否と理由を返す。⚠️ 落ちた理由を必ず日本語で持たせる（数字だけだと直しようがない） */
export function judge(
  def: StageDef,
  opts: { drops?: readonly number[]; seeds?: number } = {},
): StageReport {
  const drops = opts.drops ?? RUBRIC.DROPS;
  const seeds = opts.seeds ?? RUBRIC.SEEDS;
  const scores: number[] = [];
  const secs: number[] = [];
  for (const drop of drops) {
    let sc = 0;
    let se = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = runOnce(def, seed, drop);
      sc += r.score;
      se += r.secs;
    }
    scores.push(Math.round(sc / seeds));
    secs.push(se / seeds);
  }

  const best = Math.max(...scores);
  const worst = Math.min(...scores);
  const bestSecs = secs[scores.indexOf(best)];
  const spread = best / Math.max(1, worst);
  const good = scores.filter((s) => s >= RUBRIC.GOOD_MIN).length;

  const ng: string[] = [];
  if (best < RUBRIC.BEST_MIN) ng.push(`当たりでも${best}点しか増えない（${RUBRIC.BEST_MIN}点以上ほしい）`);
  if (best > RUBRIC.BEST_MAX) ng.push(`増えすぎ${best}点（R2の配り切りが長くなる）`);
  if (bestSecs < RUBRIC.SECS_MIN) ng.push(`当たりでも${bestSecs.toFixed(0)}秒で終わる（短すぎ）`);
  if (bestSecs > RUBRIC.SECS_MAX) ng.push(`当たりが${bestSecs.toFixed(0)}秒かかる（長すぎ）`);
  if (spread < RUBRIC.SPREAD_MIN)
    ng.push(`どこに落としても同じ（差${spread.toFixed(1)}倍・狙う意味がない）`);
  if (good < RUBRIC.GOOD_COUNT_MIN)
    ng.push(`狙える場所が${good}か所しかない（${RUBRIC.GOOD_COUNT_MIN}か所ほしい・運ゲーになる）`);

  return { name: def.name, scores, secs, best, worst, spread, bestSecs, pass: ng.length === 0, ng };
}

/** レポート1行 */
export function line(r: StageReport): string {
  return (
    `${r.pass ? '合格' : '不可'} ${r.name.padEnd(20)} ` +
    `${r.scores.map((s) => String(s).padStart(5)).join(' ')} | ` +
    `差${r.spread.toFixed(1)}倍 ${r.bestSecs.toFixed(0)}秒` +
    (r.ng.length ? `\n       └ ${r.ng.join(' / ')}` : '')
  );
}
