import { CONFIG } from '../core/config';
import { STAGES } from '../core/stages';
import type { StageDef } from '../core/stageDef';
import { UNLOCKS, nextUnlock, unlockProgress, type Unlock } from '../core/workshop';
import { BALL_SKINS, MATERIALS, SKIN } from '../render/theme';
import { getTotal } from './totals';

/**
 * 工房の描画。
 *
 * 🔑 **主役はプレビュー**（2026-07-25 れいあ要望でリッチ化）。このゲームは「落ちる球を見るゲーム」なので、
 *    報酬が文字だけだと「何が増えるのか」が伝わらない。玉は実物の玉、素材は実物の盤面、
 *    型はミニ図を出して、**解放前から「これが手に入る」が見える**ようにする。
 * ⚠️ ブランドUIなので絵文字は使わない。状態は「明るさ」と「金色の枠」で示す。
 */

const KIND_LABEL: Record<Unlock['kind'], string> = { ball: 'MARBLE', theme: 'BOARD', stage: 'STAGE' };

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

function preview(u: Unlock): string {
  if (u.kind === 'ball') return ballPreview(u.key);
  if (u.kind === 'theme') return themePreview(u.key);
  return stagePreview(u.key);
}

export function renderWorkshop(): void {
  const total = getTotal();
  const { done, all } = unlockProgress(total);
  const next = nextUnlock(total);

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

  const list = document.getElementById('workshop-list') as HTMLElement;
  list.innerHTML = UNLOCKS.map((u) => {
    const got = total >= u.cost;
    return (
      `<div class="ws-card ${got ? 'got' : 'lock'}">` +
      preview(u) +
      `<div class="ws-kind">${KIND_LABEL[u.kind]}</div>` +
      `<div class="ws-name">${u.name}</div>` +
      `<div class="ws-cost">${got ? '解放済み' : u.cost.toLocaleString('ja-JP')}</div>` +
      `</div>`
    );
  }).join('');
}
