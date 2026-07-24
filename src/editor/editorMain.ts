import { BallPool } from '../core/ball';
import { CONFIG } from '../core/config';
import { Session } from '../core/session';
import { stageToWorld } from '../core/stage';
import { DEFAULT_STAGE_DEF, normalizeStageDef, type StageDef } from '../core/stageDef';
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

/** 選択中のものを強調する。renderer には触らず、上から重ねて描く */
function drawSelection(): void {
  const sel = model.selected;
  if (!sel) return;

  const r = renderer.boardRectCss();
  const s = r.width / CONFIG.BOARD_WIDTH;
  const canvas = boardEl.querySelector('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const px = (x: number) => (r.left + x * s) * dpr;
  const py = (y: number) => (r.top + y * s) * dpr;

  // ⚠️ 仕切りは真鍮色で描かれているので、枠まで真鍮だと選択中か分からない（実機で確認）
  const color = sel.kind === 'divider' ? '#fdf6ec' : '#e6b862';

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2 * dpr;
  ctx.setLineDash([6 * dpr, 4 * dpr]);

  if (sel.kind === 'divider') {
    const d = model.def.dividers[sel.index];
    if (d) {
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.moveTo(px(d.x1), py(d.y1));
      ctx.lineTo(px(d.x2), py(d.y2));
      ctx.stroke();
      // 端の点＝つかむと長さと向きが変わる場所
      ctx.setLineDash([]);
      for (const [x, y] of [
        [d.x1, d.y1],
        [d.x2, d.y2],
      ]) {
        ctx.beginPath();
        ctx.arc(px(x), py(y), 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    const list = sel.kind === 'gate' ? model.def.gates : model.def.jumpers;
    const b = list[sel.index];
    if (b) {
      // ⚠️ 実際に描かれている帯より少し大きい枠で囲う（太さを変えたら追従する）
      const thickness =
        sel.kind === 'gate' ? CONFIG.GATE_THICKNESS : CONFIG.JUMPER_THICKNESS;
      const h = (thickness + 5) * s * dpr;
      ctx.strokeRect(px(b.x1) - 3 * dpr, py(b.y) - h / 2, (b.x2 - b.x1) * s * dpr + 6 * dpr, h);
    }
  }
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
  // 試遊中はゲーム本体と同じ操作＝つかんだ所へ玉の出口を動かし、触った時点で落ち始める
  if (session) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    session.setCupX(renderer.toLogicalX(e.clientX));
    session.start();
    return;
  }
  const p = toLogical(e);
  const hit = model.pick(p.x, p.y);
  model.select(hit);
  grab = hit ? model.grabMode(p.x, p.y, hit) : null;
  if (hit) (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  syncPanel();
});

boardEl.addEventListener('pointermove', (e) => {
  if (session) {
    if (e.pointerType === 'mouse' && e.buttons === 0) return; // マウスは押している間だけ
    session.setCupX(renderer.toLogicalX(e.clientX));
    return;
  }
  if (!grab || !model.selected) return;
  if (e.buttons === 0) return;
  const p = toLogical(e);
  if (grab === 'move') model.moveTo(p.x, p.y);
  else model.resizeTo(grab, p.x, p.y); // 仕切りは縦にも動くので y も渡す
  rebuild();
  syncPanel();
});

window.addEventListener('pointerup', () => {
  grab = null;
});

// ── 十字キーで動かす（細かい詰めはドラッグより速い・れいあ要望 2026-07-24）──
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

window.addEventListener('keydown', (e) => {
  if (session || !model.selected) return; // 試遊中と未選択は何もしない
  // ⚠️ 数値入力や名前欄にいる間は、キーの本来の動き（値の増減・カーソル移動）に任せる
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const dir = ARROWS[e.key];
  if (!dir) return;
  e.preventDefault();
  // 吸着の単位で動かす。Shift を押している間は5目盛りぶんまとめて
  const stepPx = CONFIG.EDITOR_GRID * (e.shiftKey ? 5 : 1);
  model.moveBy(dir[0] * stepPx, dir[1] * stepPx);
  rebuild();
  syncPanel();
});

// ── 右パネル ──
const MULTIPLIERS = [2, 3, 4, 10];
/** 跳ね上限のよく使う値。ここを振ってラウンドの長さを探る */
const CAPACITIES = [50, 100, 200, 400];

function syncPanel(): void {
  const sel = model.selected;
  el<HTMLDivElement>('sel-none').hidden = !!sel;
  el<HTMLDivElement>('sel-panel').hidden = !sel;
  el<HTMLButtonElement>('add-gate').disabled = !model.canAddGate();
  el<HTMLButtonElement>('add-jumper').disabled = !model.canAddJumper();
  el<HTMLButtonElement>('add-divider').disabled = !model.canAddDivider();
  if (!sel) return;

  const isDivider = sel.kind === 'divider';
  el<HTMLDivElement>('bar-fields').hidden = isDivider;
  el<HTMLDivElement>('divider-fields').hidden = !isDivider;
  el<HTMLDivElement>('mult-row').hidden = sel.kind !== 'gate';
  el<HTMLDivElement>('cap-row').hidden = sel.kind !== 'jumper';

  const label = { gate: 'ゲート', jumper: 'ジャンプ台', divider: '仕切り' }[sel.kind];
  el<HTMLSpanElement>('sel-kind').textContent = `${label} ${sel.index + 1}`;

  if (isDivider) {
    const d = model.def.dividers[sel.index];
    if (!d) return;
    el<HTMLInputElement>('d-x1').value = String(Math.round(d.x1));
    el<HTMLInputElement>('d-y1').value = String(Math.round(d.y1));
    el<HTMLInputElement>('d-x2').value = String(Math.round(d.x2));
    el<HTMLInputElement>('d-y2').value = String(Math.round(d.y2));
    return;
  }

  const list = sel.kind === 'gate' ? model.def.gates : model.def.jumpers;
  const b = list[sel.index];
  if (!b) return;
  el<HTMLInputElement>('f-y').value = String(Math.round(b.y));
  el<HTMLInputElement>('f-x1').value = String(Math.round(b.x1));
  el<HTMLInputElement>('f-x2').value = String(Math.round(b.x2));

  if (sel.kind === 'gate') {
    const cur = model.def.gates[sel.index].multiplier;
    el<HTMLDivElement>('mults').innerHTML = MULTIPLIERS.map(
      (n) => `<button data-mult="${n}" class="${n === cur ? 'on' : ''}">×${n}</button>`,
    ).join('');
  } else {
    const cur = model.capacityOf(sel) ?? CONFIG.JUMPER_CAPACITY;
    el<HTMLInputElement>('f-cap').value = String(cur);
    el<HTMLDivElement>('caps').innerHTML = CAPACITIES.map(
      (n) => `<button data-cap="${n}" class="${n === cur ? 'on' : ''}">${n}</button>`,
    ).join('');
  }
}

el<HTMLDivElement>('mults').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  model.setMultiplier(Number(b.dataset.mult));
  rebuild();
  syncPanel();
});

el<HTMLDivElement>('caps').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  model.setCapacity(Number(b.dataset.cap));
  rebuild();
  syncPanel();
});

el<HTMLInputElement>('f-cap').addEventListener('change', (e) => {
  model.setCapacity(Number((e.target as HTMLInputElement).value));
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
    if (!sel || sel.kind === 'divider') return;
    const list = sel.kind === 'gate' ? model.def.gates : model.def.jumpers;
    apply(list[sel.index] as never, Number((e.target as HTMLInputElement).value));
    model.normalizeSelected(); // 打ち込みでも制約を割らせない
    rebuild();
    syncPanel();
  });
}

for (const [id, key] of [
  ['d-x1', 'x1'],
  ['d-y1', 'y1'],
  ['d-x2', 'x2'],
  ['d-y2', 'y2'],
] as const) {
  el<HTMLInputElement>(id).addEventListener('change', (e) => {
    const sel = model.selected;
    if (!sel || sel.kind !== 'divider') return;
    model.def.dividers[sel.index][key] = Number((e.target as HTMLInputElement).value);
    model.normalizeSelected();
    rebuild();
    syncPanel();
  });
}

el<HTMLButtonElement>('roll').addEventListener('click', () => {
  stopPlay();
  model.roll(Date.now());
  rebuild();
  syncPanel();
  const caps = model.def.jumpers.map((j) => j.capacity).join('/');
  setStatus(`中身を振り直したよ（倍率 ${model.def.gates.map((g) => g.multiplier).join('/')}／跳ね上限 ${caps}）`);
});

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
el<HTMLButtonElement>('add-divider').addEventListener('click', () => {
  model.addDivider();
  rebuild();
  syncPanel();
});
el<HTMLButtonElement>('del').addEventListener('click', () => {
  model.deleteSelected();
  rebuild();
  syncPanel();
});

el<HTMLButtonElement>('reset').addEventListener('click', () => {
  stopPlay();
  model = new EditorModel(structuredClone(DEFAULT_STAGE_DEF));
  el<HTMLInputElement>('name').value = model.def.name;
  rebuild();
  syncPanel();
  setStatus('最初の配置に戻したよ');
});

// ── 保存・読み込み（開発サーバーがファイルを扱う。コピペはさせない）──
async function refreshStageList(): Promise<void> {
  const box = el<HTMLSelectElement>('open-name');
  try {
    const res = await fetch('/__stages');
    const names: string[] = (await res.json())?.stages ?? [];
    const keep = box.value;
    box.innerHTML = names.length
      ? names.map((n) => `<option value="${n}">${n}</option>`).join('')
      : '<option value="">（保存はまだ無いよ）</option>';
    if (names.includes(keep)) box.value = keep;
    el<HTMLButtonElement>('open').disabled = names.length === 0;
  } catch {
    // 開発サーバー以外（ビルド版）で開いた時はここに来る。保存・読み込みは使えない
    box.innerHTML = '<option value="">（開発サーバーでだけ使えるよ）</option>';
    el<HTMLButtonElement>('open').disabled = true;
    el<HTMLButtonElement>('save').disabled = true;
    // ⚠️ ボタンが押せないだけだと「壊れている」ように見えるので、理由を出す
    setStatus('公開版では保存できないよ。npm run dev のエディタで開いてね');
  }
}

el<HTMLButtonElement>('save').addEventListener('click', async () => {
  const def: StageDef = { ...model.def, name: el<HTMLInputElement>('name').value.trim() };
  try {
    const res = await fetch('/__save-stage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(def),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      model.def.name = def.name;
      setStatus(`保存したよ → ${body.file}`);
      await refreshStageList();
      el<HTMLSelectElement>('open-name').value = def.name;
    } else {
      setStatus(`保存できなかった: ${body.error ?? res.status}`);
    }
  } catch (e) {
    setStatus(`保存できなかった: ${String(e)}`);
  }
});

el<HTMLButtonElement>('open').addEventListener('click', async () => {
  const name = el<HTMLSelectElement>('open-name').value;
  if (!name) return;
  try {
    const res = await fetch(`/__stages?name=${encodeURIComponent(name)}`);
    if (!res.ok) {
      setStatus(`開けなかった: ${res.status}`);
      return;
    }
    stopPlay();
    // ⚠️ 手で直したJSONでも落ちないように整えてから入れる
    model.load(normalizeStageDef(await res.json()));
    el<HTMLInputElement>('name').value = model.def.name;
    rebuild();
    syncPanel();
    setStatus(`${name} を開いたよ`);
  } catch (e) {
    setStatus(`開けなかった: ${String(e)}`);
  }
});

// ── 試し撃ち ──
function stopPlay(): void {
  if (!session) return;
  session = null;
  const btn = el<HTMLButtonElement>('play');
  btn.textContent = '試遊する';
  btn.classList.remove('on');
}

el<HTMLButtonElement>('play').addEventListener('click', () => {
  if (session) {
    stopPlay();
    return;
  }
  const btn = el<HTMLButtonElement>('play');
  // ⚠️ ここでは start() しない。ゲーム本体と同じで、盤面を触った所から落ち始める
  //    ＝出口の位置を決めてから始められるようにするため（配置の良し悪しはここで変わる）
  session = new Session(model.buildStage());
  btn.textContent = '編集に戻る';
  btn.classList.add('on');
  setStatus('盤面をドラッグすると出口が動くよ。触ったところから落ち始める');
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
    void refreshStageList();
    requestAnimationFrame(draw);
  }),
);

window.addEventListener('resize', () => renderer.resize());
