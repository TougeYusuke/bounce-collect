import {
  FREE,
  RANDOM,
  UNLOCKS,
  VISIBLE_KINDS,
  nextUnlock,
  unlockProgress,
  unlockedKeys,
  type UnlockKind,
} from '../core/workshop';
import { drawBall } from '../render/ballArt';
import { BALL_SKINS, BUCKET_SKINS, MATERIALS, findBallSkin, findBucketSkin } from '../render/theme';
import { drawVessel } from '../render/vesselArt';
import { loadPrefs, savePrefs } from './prefs';
import { getTotal } from './totals';

/**
 * 工房の描画。
 *
 * 🔑 **主役はプレビュー**（2026-07-25 れいあ要望でリッチ化）。このゲームは「落ちる球を見るゲーム」なので、
 *    報酬が文字だけだと「何が増えるのか」が伝わらない。玉も素材も**実物をそのまま**出して、
 *    解放前から「これが手に入る」が見えるようにする。
 * 🔑 **玉と素材は選べる**（2026-07-25 れいあ要望「スキンは好みがあるからユーザーが選べるようにしたい」）。
 *    ⚠️ そのため**無料のぶんも並べる**。解放リストだけ並べていた頃は、最初から持っている
 *    マホガニー・チェリー・ビー玉が画面に出ず、選ぶことすらできなかった。
 * ⚠️ ブランドUIなので絵文字は使わない。状態は「明るさ」「金の枠」「選択中の帯」で示す。
 * ⚠️ **型（ステージ）はここに出さない**（2026-07-25 れいあ判断「内部で管理すればいい。
 *    サムネイルを用意するのも面倒だし、何より知らないほうがワクワク感はありそう」）。
 *    解放そのものは続くので、遊ぶほど黙って新しい盤面が混ざる。
 */

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
    if (kind === 'bucket') return BUCKET_SKINS.find((b) => b.key === key)?.name ?? key;
    return `素材：${MATERIALS.find((m) => m.key === key)?.name ?? key}`;
  };
  const free = FREE[kind].map((key) => ({ kind, key, name: nameOf(key), cost: 0 }));
  return [...free, ...paid];
}

/**
 * 玉の見た目。⚠️ **実物と同じ `drawBall` で焼く**（CSSのグラデで真似ない）。
 *    真似ていると、星や縫い目のような新しいスキンを足したときにプレビューだけ古いまま残る。
 * マーブル（複数色）は色が分かるように3個ならべて出す。
 */
function ballPreview(key: string): string {
  const skin = findBallSkin(key);
  const n = skin.palette ? 3 : 1;
  const r = skin.palette ? 13 : 20;
  const c = document.createElement('canvas');
  const w = skin.palette ? 58 : 50;
  c.width = w * 2;
  c.height = 50 * 2;
  const g = c.getContext('2d');
  if (g) {
    g.scale(2, 2);
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? w / 2 : 15 + i * 14;
      drawBall(g, x, 25 - (i % 2) * 4, r, skin, i);
    }
  }
  return `<div class="ws-pv"><img alt="" width="${w}" height="50" src="${c.toDataURL()}"></div>`;
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

/** おまかせ（毎回抽選）のカード。素材だけに出す */
function randomPreview(): string {
  const g = MATERIALS.slice(0, 4)
    .map((m, i) => `${m.wedgeTop} ${i * 25}% ${(i + 1) * 25}%`)
    .join(',');
  return `<div class="ws-pv" style="background:linear-gradient(135deg,${g})"></div>`;
}

/**
 * 器。⚠️ **実物と同じ `drawVessel` で焼く**（CSSで真似ない）。
 *    真似ていると、器の形を足した時にプレビューだけ古い見た目のまま残る。
 *    ⚠️ 木のバケツだけは画像なので `<img>` で出す。
 */
function bucketPreview(key: string): string {
  const b = findBucketSkin(key);
  if (b.form === 'image') {
    return (
      `<div class="ws-pv">` +
      `<img alt="" src="assets/bucket-wood.png" style="width:46px;height:46px;object-fit:contain">` +
      `</div>`
    );
  }
  const c = document.createElement('canvas');
  c.width = 100;
  c.height = 100;
  const g = c.getContext('2d');
  if (g) {
    g.scale(2, 2);
    drawVessel(g, 25, 12, 17, b);
  }
  return `<div class="ws-pv"><img alt="" width="50" height="50" src="${c.toDataURL()}"></div>`;
}

function preview(kind: UnlockKind, key: string): string {
  if (kind === 'ball') return ballPreview(key);
  if (kind === 'bucket') return bucketPreview(key);
  return key === RANDOM ? randomPreview() : themePreview(key);
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
  const ownedBuckets = unlockedKeys('bucket', total);
  const prefs = loadPrefs(ownedBalls, ownedThemes, ownedBuckets);

  // 直前に解放したものを起点にすると、バーが「前回からどこまで来たか」を表す
  // ⚠️ 見える種類だけで数える。隠している型の解放を混ぜるとバーが理由なく飛ぶ
  const prevCost =
    UNLOCKS.filter((u) => VISIBLE_KINDS.includes(u.kind) && total >= u.cost).slice(-1)[0]?.cost ?? 0;
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
  const buckets = catalog('bucket')
    .map((it) => card(it, ownedBuckets.includes(it.key), prefs.bucket === it.key, true))
    .join('');
  const list = document.getElementById('workshop-list') as HTMLElement;
  list.innerHTML =
    section('玉', '好きなものを選べる', balls) +
    section('バケツ', '上のカップの見た目', buckets) +
    section('素材', 'おまかせなら毎回変わる', themes);

  // ⚠️ カードは描き直すたびに作り直すので、リスナーは親に1つだけ付ける（多重登録を防ぐ）
  list.onclick = (e) => {
    const el = (e.target as HTMLElement).closest('.ws-card.pick') as HTMLElement | null;
    if (!el) return;
    const kind = el.dataset.kind as 'ball' | 'theme' | 'bucket';
    const key = el.dataset.key as string;
    savePrefs({ ...prefs, [kind]: key });
    renderWorkshop();
  };
}
