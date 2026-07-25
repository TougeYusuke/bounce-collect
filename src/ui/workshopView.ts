import { CONFIG } from '../core/config';
import { STAGES } from '../core/stages';
import type { StageDef } from '../core/stageDef';
import {
  FREE,
  RANDOM,
  UNLOCKS,
  nextUnlock,
  unlockProgress,
  unlockedKeys,
  type UnlockKind,
} from '../core/workshop';
import { BALL_SKINS, MATERIALS, SKIN } from '../render/theme';
import { loadPrefs, savePrefs } from './prefs';
import { getTotal } from './totals';

/**
 * 工房の描画。
 *
 * 🔑 **主役はプレビュー**（2026-07-25 れいあ要望でリッチ化）。このゲームは「落ちる球を見るゲーム」なので、
 *    報酬が文字だけだと「何が増えるのか」が伝わらない。玉は実物の玉、素材は実物の盤面、
 *    型はミニ図を出して、**解放前から「これが手に入る」が見える**ようにする。
 * 🔑 **玉と素材は選べる**（2026-07-25 れいあ要望「スキンは好みがあるからユーザーが選べるようにしたい」）。
 *    ⚠️ そのため**無料のぶんも並べる**。解放リストだけ並べていた頃は、最初から持っている
 *    マホガニー・チェリー・ビー玉が画面に出ず、選ぶことすらできなかった。
 * ⚠️ ブランドUIなので絵文字は使わない。状態は「明るさ」「金の枠」「選択中の帯」で示す。
 * ⚠️ 型（ステージ）は選べない＝毎回抽選が設計（ラウンドごとに景色が変わる）。見せるだけ。
 */

/** 解放リストに無いもの（＝最初から持っているもの）の表示名 */
const FREE_NAMES: Record<string, string> = {
  default: '型：既定',
  'type-01-classic': '型：基本',
  'type-02-wide-top': '型：広い上段',
};

interface Item {
  kind: UnlockKind;
  key: string;
  name: string;
  /** 0 なら最初から持っている */
  cost: number;
}

/** その種類の全部（無料 → 解放コストの小さい順） */
function catalog(kind: UnlockKind): Item[] {
  const paid = UNLOCKS.filter((u) => u.kind === kind).map((u) => ({ ...u }));
  const nameOf = (key: string): string => {
    if (kind === 'ball') return BALL_SKINS.find((b) => b.key === key)?.name ?? key;
    if (kind === 'theme') return `素材：${MATERIALS.find((m) => m.key === key)?.name ?? key}`;
    return FREE_NAMES[key] ?? key;
  };
  const free = FREE[kind].map((key) => ({ kind, key, name: nameOf(key), cost: 0 }));
  return [...free, ...paid];
}

/** 玉の見た目そのまま（実物の描画と同じグラデーション） */
function ballPreview(key: string): string {
  const b = BALL_SKINS.find((x) => x.key === key) ?? BALL_SKINS[0];
  const g = `radial-gradient(circle at 32% 32%, ${b.hi} 0%, ${b.mid} 62%, ${b.lo} 100%)`;
  return `<div class="ws-pv"><div class="ball" style="background:${g}"></div></div>`;
}

/** 盤面の素材画像をそのまま見せる。⚠️ 読めない時も枠だけ出す（ゲームは止めない方針と同じ） */
function themePreview(key: string): string {
  const m = MATERIALS.find((x) => x.key === key);
  if (!m) return '<div class="ws-pv"></div>';
  return (
    `<div class="ws-pv board" style="background-image:url(assets/${m.board})">` +
    `<span style="display:block;width:34px;height:7px;border-radius:4px;background:${m.wedgeTop}"></span>` +
    `</div>`
  );
}

/**
 * 型のミニ図。ゲート＝緑／ジャンプ台＝青／仕切り＝真鍮で、実物と同じ色分けにする。
 * ⚠️ 盤面は 360×720 固定なので、そのまま viewBox に入れて縮めるだけでよい。
 */
function stagePreview(name: string): string {
  const def: StageDef | undefined = STAGES.find((s) => s.name === name);
  if (!def) return '<div class="ws-pv"></div>';
  const W = CONFIG.BOARD_WIDTH;
  const H = CONFIG.BOARD_HEIGHT;
  const bar = (x1: number, x2: number, y: number, color: string, h: number) =>
    `<rect x="${x1}" y="${y - h / 2}" width="${Math.max(6, x2 - x1)}" height="${h}" rx="${h / 2}" fill="${color}"/>`;
  const parts = [
    `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(0,0,0,.25)"/>`,
    ...def.gates.map((g) => bar(g.x1, g.x2, g.y, SKIN.gate, 34)),
    ...def.jumpers.map((j) => bar(j.x1, j.x2, j.y, SKIN.jump, 34)),
    ...def.dividers.map(
      (d) =>
        `<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${SKIN.metal}" stroke-width="14" stroke-linecap="round"/>`,
    ),
  ];
  return (
    `<div class="ws-pv"><svg width="42" height="56" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
    parts.join('') +
    '</svg></div>'
  );
}

/** おまかせ（毎回抽選）のカード。素材だけに出す */
function randomPreview(): string {
  const g = MATERIALS.slice(0, 4)
    .map((m, i) => `${m.wedgeTop} ${i * 25}% ${(i + 1) * 25}%`)
    .join(',');
  return `<div class="ws-pv" style="background:linear-gradient(135deg,${g})"></div>`;
}

function preview(kind: UnlockKind, key: string): string {
  if (kind === 'ball') return ballPreview(key);
  if (kind === 'theme') return key === RANDOM ? randomPreview() : themePreview(key);
  return stagePreview(key);
}

function card(it: Item, owned: boolean, selected: boolean, pickable: boolean): string {
  const cls = ['ws-card'];
  if (!owned) cls.push('lock');
  else cls.push('got');
  if (selected) cls.push('sel');
  if (owned && pickable) cls.push('pick');
  const state = !owned
    ? it.cost.toLocaleString('ja-JP')
    : selected
      ? '選択中'
      : pickable
        ? 'えらぶ'
        : '解放済み';
  return (
    `<div class="${cls.join(' ')}"${owned && pickable ? ` data-kind="${it.kind}" data-key="${it.key}"` : ''}>` +
    preview(it.kind, it.key) +
    `<div class="ws-name">${it.name}</div>` +
    `<div class="ws-cost">${state}</div>` +
    `</div>`
  );
}

function section(title: string, note: string, cards: string): string {
  return (
    `<div class="ws-sec"><div class="ws-sec-h">${title}<span>${note}</span></div>` +
    `<div class="ws-grid">${cards}</div></div>`
  );
}

export function renderWorkshop(): void {
  const total = getTotal();
  const { done, all } = unlockProgress(total);
  const next = nextUnlock(total);
  const ownedBalls = unlockedKeys('ball', total);
  const ownedThemes = unlockedKeys('theme', total);
  const ownedStages = unlockedKeys('stage', total);
  const prefs = loadPrefs(ownedBalls, ownedThemes);

  // 直前に解放したものを起点にすると、バーが「前回からどこまで来たか」を表す
  const prevCost = UNLOCKS.filter((u) => total >= u.cost).slice(-1)[0]?.cost ?? 0;
  const ratio = next ? Math.min(1, Math.max(0, (total - prevCost) / (next.cost - prevCost))) : 1;

  const top = document.getElementById('workshop-top') as HTMLElement;
  top.innerHTML =
    `<div class="ws-total"><span class="ws-k">MARBLES</span>` +
    `<span class="ws-v">${total.toLocaleString('ja-JP')}</span></div>` +
    `<div class="ws-next">${
      next
        ? `次は「${next.name}」まで あと <b>${(next.cost - total).toLocaleString('ja-JP')}</b>`
        : 'ぜんぶ解放したよ！'
    }</div>` +
    `<div class="ws-bar"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>` +
    `<div class="ws-prog">解放 ${done} / ${all}</div>`;

  const balls = catalog('ball')
    .map((it) => card(it, ownedBalls.includes(it.key), prefs.ball === it.key, true))
    .join('');
  const themes =
    card({ kind: 'theme', key: RANDOM, name: '素材：おまかせ', cost: 0 }, true, prefs.theme === RANDOM, true) +
    catalog('theme')
      .map((it) => card(it, ownedThemes.includes(it.key), prefs.theme === it.key, true))
      .join('');
  const stages = catalog('stage')
    .map((it) => card(it, ownedStages.includes(it.key), false, false))
    .join('');

  const list = document.getElementById('workshop-list') as HTMLElement;
  list.innerHTML =
    section('玉', '好きなものを選べる', balls) +
    section('素材', 'おまかせなら毎回変わる', themes) +
    section('型', '毎回ランダムで選ばれる', stages);

  // ⚠️ カードは描き直すたびに作り直すので、リスナーは親に1つだけ付ける（多重登録を防ぐ）
  list.onclick = (e) => {
    const el = (e.target as HTMLElement).closest('.ws-card.pick') as HTMLElement | null;
    if (!el) return;
    const kind = el.dataset.kind as 'ball' | 'theme';
    const key = el.dataset.key as string;
    savePrefs({ ...prefs, [kind]: key });
    renderWorkshop();
  };
}
