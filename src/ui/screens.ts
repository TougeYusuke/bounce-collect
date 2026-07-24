import { loadScores, type ScoreEntry } from './scores';

/**
 * 画面遷移。表示状態を持つのはここだけに閉じ込める。
 * 'play' は「何も被せない」状態＝全オーバーレイを消すだけ。
 */
export type ScreenName = 'title' | 'play' | 'result' | 'scores';

const IDS: Record<Exclude<ScreenName, 'play'>, string> = {
  title: 'screen-title',
  result: 'screen-result',
  scores: 'screen-scores',
};

let current: ScreenName = 'title';

export function getScreen(): ScreenName {
  return current;
}

export function showScreen(name: ScreenName): void {
  current = name;
  for (const [key, id] of Object.entries(IDS)) {
    (document.getElementById(id) as HTMLDivElement).hidden = key !== name;
  }
}

/** 「2026-07-24」→「07-24」 */
function shortDate(d: string): string {
  return d.length >= 10 ? d.slice(5) : d;
}

/** ランキングの行を組む。markIndex の行だけ強調する（-1 で強調なし） */
function rankRows(entries: ScoreEntry[], markIndex: number, limit: number): string {
  const list = entries.slice(0, limit);
  if (list.length === 0) {
    return '<div class="rank-empty">まだ記録がないよ。1回遊んでみよ！</div>';
  }
  return list
    .map((e, i) => {
      const me = i === markIndex ? ' me' : '';
      return (
        `<div class="rank-row${me}">` +
        `<div class="no">${i + 1}</div>` +
        `<div class="v">${e.score.toLocaleString('ja-JP')}</div>` +
        `<div class="d">${e.material}・${shortDate(e.date)}</div>` +
        `</div>`
      );
    })
    .join('');
}

/** タイトル画面のハイスコアTOP5を描く */
export function renderTitleScores(): void {
  const el = document.getElementById('title-hs-list') as HTMLElement;
  el.innerHTML = rankRows(loadScores(), -1, 5);
}

/** ハイスコア一覧（全件）を描く */
export function renderScoresList(): void {
  const el = document.getElementById('scores-list') as HTMLElement;
  el.innerHTML = rankRows(loadScores(), -1, loadScores().length || 1);
}

/**
 * リザルトを描いて表示する。
 * @param score 今回のスコア
 * @param rank  ハイスコア内での順位（0始まり・圏外は-1）。0 のとき NEW RECORD を出す
 */
export function renderResult(score: number, rank: number): void {
  (document.getElementById('result-score') as HTMLElement).textContent =
    score.toLocaleString('ja-JP');
  (document.getElementById('result-badge') as HTMLElement).hidden = rank !== 0;
  (document.getElementById('result-list') as HTMLElement).innerHTML = rankRows(
    loadScores(),
    rank,
    5,
  );
  showScreen('result');
}
