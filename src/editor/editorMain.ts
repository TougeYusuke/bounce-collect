import { BallPool } from '../core/ball';
import { CONFIG } from '../core/config';
import { Session } from '../core/session';
import { stageToWorld } from '../core/stage';
import { DEFAULT_STAGE_DEF, type StageDef } from '../core/stageDef';
import { loadArt } from '../render/art';
import { CanvasRenderer } from '../render/canvasRenderer';
import { MATERIALS } from '../render/theme';
import { EditorModel, type GrabMode } from './editorModel';

const boardEl = document.getElementById('board')!;
const renderer = new CanvasRenderer();
const empty = new BallPool(1); // 編集中は玉なしで盤面だけ描く

let model = new EditorModel(structuredClone(DEFAULT_STAGE_DEF));
let stage = model.buildStage();
let grab: GrabMode | null = null;
let session: Session | null = null; // 試遊中だけ入る

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = el<HTMLDivElement>('status');

function setStatus(msg: string): void {
  status.textContent = msg;
}

/** 編集内容を実行時のステージに反映する（描画も試遊もこれを見る） */
function rebuild(): void {
  stage = model.buildStage();
}

// ── 描画 ──
function draw(): void {
  if (session) {
    renderer.draw(session.pool, CONFIG.BALL_RADIUS, session.stage, session.cupX, 0);
  } else {
    renderer.draw(empty, CONFIG.BALL_RADIUS, stage, CONFIG.BOARD_WIDTH / 2, 0);
    drawSelection();
  }
  requestAnimationFrame(draw);
}

/** 選択中のバーを枠で囲う。renderer には触らず、上から重ねて描く */
function drawSelection(): void {
  const sel = model.selected;
  if (!sel) return;
  const list = sel.kind === 'gate' ? model.def.gates : model.def.jumpers;
  const b = list[sel.index];
  if (!b) return;

  const r = renderer.boardRectCss();
  const s = r.width / CONFIG.BOARD_WIDTH;
  const canvas = boardEl.querySelector('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = '#e6b862';
  ctx.lineWidth = 2 * dpr;
  ctx.setLineDash([6 * dpr, 4 * dpr]);
  const x = (r.left + b.x1 * s) * dpr;
  const y = (r.top + b.y * s) * dpr;
  const w = (b.x2 - b.x1) * s * dpr;
  const h = 18 * s * dpr;
  ctx.strokeRect(x - 3 * dpr, y - h / 2, w + 6 * dpr, h);
  ctx.restore();
}

// ── 入力（画面座標 → 論理座標）──
function toLogical(e: PointerEvent): { x: number; y: number } {
  const r = renderer.boardRectCss();
  const rect = (boardEl.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect();
  const s = r.width / CONFIG.BOARD_WIDTH;
  return {
    x: (e.clientX - rect.left - r.left) / s,
    y: (e.clientY - rect.top - r.top) / s,
  };
}

boardEl.addEventListener('pointerdown', (e) => {
  if (session) return; // 試遊中は編集しない
  const p = toLogical(e);
  const hit = model.pick(p.x, p.y);
  model.select(hit);
  grab = hit ? model.grabMode(p.x, p.y, hit) : null;
  if (hit) (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  syncPanel();
});

boardEl.addEventListener('pointermove', (e) => {
  if (session || !grab || !model.selected) return;
  if (e.buttons === 0) return;
  const p = toLogical(e);
  if (grab === 'move') model.moveTo(p.x, p.y);
  else model.resizeTo(grab, p.x);
  rebuild();
  syncPanel();
});

window.addEventListener('pointerup', () => {
  grab = null;
});

// ── 右パネル ──
const MULTIPLIERS = [2, 3, 4, 10];

function syncPanel(): void {
  const sel = model.selected;
  el<HTMLDivElement>('sel-none').hidden = !!sel;
  el<HTMLDivElement>('sel-panel').hidden = !sel;
  el<HTMLButtonElement>('add-gate').disabled = !model.canAddGate();
  el<HTMLButtonElement>('add-jumper').disabled = !model.canAddJumper();
  if (!sel) return;

  const list = sel.kind === 'gate' ? model.def.gates : model.def.jumpers;
  const b = list[sel.index];
  el<HTMLSpanElement>('sel-kind').textContent =
    sel.kind === 'gate' ? `ゲート ${sel.index + 1}` : `ジャンプ台 ${sel.index + 1}`;
  el<HTMLInputElement>('f-y').value = String(Math.round(b.y));
  el<HTMLInputElement>('f-x1').value = String(Math.round(b.x1));
  el<HTMLInputElement>('f-x2').value = String(Math.round(b.x2));

  // 倍率はゲートだけ
  el<HTMLDivElement>('mult-row').hidden = sel.kind !== 'gate';
  const cur = sel.kind === 'gate' ? model.def.gates[sel.index].multiplier : 0;
  el<HTMLDivElement>('mults').innerHTML = MULTIPLIERS.map(
    (n) => `<button data-mult="${n}" class="${n === cur ? 'on' : ''}">×${n}</button>`,
  ).join('');
}

el<HTMLDivElement>('mults').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  model.setMultiplier(Number(b.dataset.mult));
  rebuild();
  syncPanel();
});

// 数値入力からも動かせる（細かい詰めはこちらの方が速い）
for (const [id, apply] of [
  ['f-y', (b: { y: number }, v: number) => (b.y = v)],
  ['f-x1', (b: { x1: number }, v: number) => (b.x1 = v)],
  ['f-x2', (b: { x2: number }, v: number) => (b.x2 = v)],
] as const) {
  el<HTMLInputElement>(id).addEventListener('change', (e) => {
    const sel = model.selected;
    if (!sel) return;
    const list = sel.kind === 'gate' ? model.def.gates : model.def.jumpers;
    apply(list[sel.index] as never, Number((e.target as HTMLInputElement).value));
    rebuild();
    syncPanel();
  });
}

el<HTMLButtonElement>('add-gate').addEventListener('click', () => {
  model.addGate();
  rebuild();
  syncPanel();
});
el<HTMLButtonElement>('add-jumper').addEventListener('click', () => {
  model.addJumper();
  rebuild();
  syncPanel();
});
el<HTMLButtonElement>('del').addEventListener('click', () => {
  model.deleteSelected();
  rebuild();
  syncPanel();
});

el<HTMLButtonElement>('reset').addEventListener('click', () => {
  model = new EditorModel(structuredClone(DEFAULT_STAGE_DEF));
  rebuild();
  syncPanel();
  setStatus('既定のステージを読み直したよ');
});

// ── 保存（開発サーバーがファイルに書く。コピペはさせない）──
el<HTMLButtonElement>('save').addEventListener('click', async () => {
  const def: StageDef = { ...model.def, name: el<HTMLInputElement>('name').value.trim() };
  try {
    const res = await fetch('/__save-stage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(def),
    });
    const body = await res.json().catch(() => ({}));
    setStatus(res.ok ? `保存したよ → ${body.file}` : `保存できなかった: ${body.error ?? res.status}`);
  } catch (e) {
    setStatus(`保存できなかった: ${String(e)}`);
  }
});

// ── 試し撃ち ──
el<HTMLButtonElement>('play').addEventListener('click', () => {
  const btn = el<HTMLButtonElement>('play');
  if (session) {
    session = null;
    btn.textContent = '試遊する';
    btn.classList.remove('on');
    return;
  }
  session = new Session(model.buildStage());
  session.start();
  btn.textContent = '編集に戻る';
  btn.classList.add('on');
});

// 試遊中は毎フレーム進める
setInterval(() => {
  if (session && !session.finished) session.update(1);
}, 1000 / 60);

// ── 起動 ──
void renderer.init(boardEl, stageToWorld(stage)).then(() =>
  loadArt([...MATERIALS.map((m) => m.board), 'bucket-wood.png']).then(() => {
    renderer.setMaterial(MATERIALS[0]);
    syncPanel();
    requestAnimationFrame(draw);
  }),
);

window.addEventListener('resize', () => renderer.resize());
