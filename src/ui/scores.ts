export interface ScoreEntry {
  score: number;
  /** YYYY-MM-DD */
  date: string;
  /** 素材テーマの表示名 */
  material: string;
}

const KEY = 'marble-mill.scores';
export const MAX_SCORES = 20;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    // ⚠️ 壊れた保存データでゲームが起動しなくなるのを防ぐ（記録より起動を優先）
    return [];
  }
}

/** 追加して保存し、入った順位（0始まり）を返す。圏外なら -1 */
export function addScore(entry: ScoreEntry): number {
  const all = [...loadScores(), entry].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // 保存できなくてもゲームは続ける
  }
  return all.indexOf(entry);
}
