import { BallPool } from '../core/ball';
import { CONFIG } from '../core/config';
import { MY_STAGE_MAX, loadMyStages, removeMyStage, saveMyStage } from '../core/myStages';
import { Session } from '../core/session';
import { stageToWorld } from '../core/stage';
import { DEFAULT_STAGE_DEF, normalizeStageDef, type StageDef } from '../core/stageDef';
import { STAGES } from '../core/stages';
import { loadArt } from '../render/art';
import { CanvasRenderer } from '../render/canvasRenderer';
import { MATERIALS } from '../render/theme';
import { loadMineOnly, saveMineOnly } from '../ui/prefs';
import { EditorModel, handleRadius, type GrabMode } from './editorModel';

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

  // ── 端を伸ばす丸（指で掴む口）──
  // ⚠️ 破線を解いてから描く（解かないと丸まで点線になる）
  ctx.setLineDash([]);
  for (const h of handlePoints()) {
    ctx.beginPath();
    ctx.arc(px(h.x), py(h.y), h.r * s * dpr, 0, Math.PI * 2);
    // 掴んでいる側を濃くする＝どちらを動かしているか、指で隠れていても分かる
    ctx.globalAlpha = grab === h.mode ? 0.55 : 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }

  if (grab && grab !== 'move') drawGrabValue(ctx, px, py, dpr, grab);
  ctx.restore();
}

/**
 * 伸縮中の数値を**指の上**に浮かせる。
 *
 * ⚠️ 指の下に置いても見えない（端を掴むと指が数値を覆う）＝伸ばした結果が分からない。
 * 🔑 バーは**幅も出す**。ジャンプ台の幅が型の成否をほぼ決める（狭いと玉が一度も乗らず、
 *    R1の回収が約600個から16個まで落ちた実測がある）。
 * ⚠️ 盤面の上端で切れる時は下へ回す。左右も画面の中へ収める。
 */
function drawGrabValue(
  ctx: CanvasRenderingContext2D,
  px: (x: number) => number,
  py: (y: number) => number,
  dpr: number,
  mode: GrabMode,
): void {
  const sel = model.selected;
  const h = handlePoints().find((q) => q.mode === mode);
  if (!sel || !h) return;

  let text: string;
  if (sel.kind === 'divider') {
    const d = model.def.dividers[sel.index];
    if (!d) return;
    const [x, y] = mode === 'resize-start' ? [d.x1, d.y1] : [d.x2, d.y2];
    text = `${Math.round(x)}, ${Math.round(y)}`;
  } else {
    const list = sel.kind === 'gate' ? model.def.gates : model.def.jumpers;
    const b = list[sel.index];
    if (!b) return;
    text = `${Math.round(mode === 'resize-start' ? b.x1 : b.x2)}　幅 ${Math.round(b.x2 - b.x1)}`;
  }

  ctx.font = `700 ${13 * dpr}px "Hiragino Sans", "Yu Gothic UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const boxW = ctx.measureText(text).width + 20 * dpr;
  const boxH = 26 * dpr;
  const gap = 34 * dpr; // 指の上へ逃がす距離
  const cx = Math.min(Math.max(px(h.x), boxW / 2), ctx.canvas.width - boxW / 2);
  const above = py(h.y) - gap;
  const cy = above - boxH / 2 < 0 ? py(h.y) + gap : above;

  ctx.fillStyle = 'rgba(18, 12, 7, 0.92)';
  ctx.strokeStyle = '#e6b862';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 8 * dpr);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fdf6ec';
  ctx.fillText(text, cx, cy);
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

// ── 端を伸ばすハンドル（指で掴む口）──
/**
 * 選択中の部品の端に置く掴み口。⚠️ **選択中のものにしか出さない**。
 *
 * 🔑 指では端8px（`grabMode` の EDGE）を掴めないので**2段階**にしてある
 *    ＝①部品をタップして選ぶ → ②端の丸を掴んで伸ばす。
 *    マウスは今までどおり1動作で端を掴める（`grabMode`）ので、どちらの手でも操作できる。
 * ⚠️ 位置は論理座標・半径は `handleRadius`（画面pxを拡大率で割った値）。
 *    **描画と当たり判定で同じものを使う**こと（見た目より広い／狭いと必ず苦情になる）。
 */
function handlePoints(): { mode: GrabMode; x: number; y: number; r: number }[] {
  const sel = model.selected;
  if (!sel) return [];
  const scale = renderer.boardRectCss().width / CONFIG.BOARD_WIDTH;

  if (sel.kind === 'divider') {
    const d = model.def.dividers[sel.index];
    if (!d) return [];
    const r = handleRadius(Math.hypot(d.x2 - d.x1, d.y2 - d.y1), scale);
    return [
      { mode: 'resize-start', x: d.x1, y: d.y1, r },
      { mode: 'resize-end', x: d.x2, y: d.y2, r },
    ];
  }
  const list = sel.kind === 'gate' ? model.def.gates : model.def.jumpers;
  const b = list[sel.index];
  if (!b) return [];
  const r = handleRadius(b.x2 - b.x1, scale);
  return [
    { mode: 'resize-start', x: b.x1, y: b.y, r },
    { mode: 'resize-end', x: b.x2, y: b.y, r },
  ];
}

/**
 * ハンドルに乗っているか。
 * ⚠️ `pick` より**先に**見ること。ハンドルは端から外側へ張り出すので、後にすると
 *    「端を伸ばそうとしたのに隣の部品を選び直す」になる。
 */
function grabHandle(p: { x: number; y: number }): GrabMode | null {
  for (const h of handlePoints()) {
    if (Math.hypot(p.x - h.x, p.y - h.y) <= h.r) return h.mode;
  }
  return null;
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
  // ⚠️ ハンドルを pick より先に見る。⚠️ ここでは**選択を変えない**
  //    （いま掴んでいるものを伸ばす操作なので、選び直すと伸ばせない）
  const onHandle = grabHandle(p);
  if (onHandle) {
    grab = onHandle;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    return;
  }
  const hit = model.pick(p.x, p.y);
  model.select(hit);
  grab = hit ? model.grabMode(p.x, p.y, hit) : null;
  if (hit) (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  syncPanel();
});

/**
 * マウスの下にあるものに合わせてカーソルの絵を変える（2026-07-27 れいあ要望）。
 * ⚠️ 元の指摘＝「クリックして操作しないと、移動なのか拡縮なのか分からない」。
 * ⚠️ **マウスがある環境だけ**（タッチにはカーソルが無いので意味がない）。
 * ⚠️ ドラッグ中（`grab` あり）は変えない＝掴んだ時の絵のままにする。
 *    途中で絵が変わると「掴み直した」ように見える。
 * ⚠️ CSS 側に `#board canvas { cursor: crosshair }` があるので、**canvas に直接**当てる
 *    （`#board` に当てても CSS の方が具体的なので効かない）。
 */
const FINE_POINTER = matchMedia('(hover: hover) and (pointer: fine)').matches;
let boardCanvas: HTMLCanvasElement | null = null;

function setCursor(v: string): void {
  if (!FINE_POINTER) return;
  boardCanvas ??= boardEl.querySelector('canvas');
  if (boardCanvas) boardCanvas.style.cursor = v;
}

function updateCursor(p: { x: number; y: number }): void {
  if (!FINE_POINTER) return;
  // 試遊中は「触った所に落ちる」操作なので狙いの十字のまま
  if (session) {
    setCursor('crosshair');
    return;
  }
  // ⚠️ ハンドルの上は伸縮。判定と同じ順（ハンドル → pick）で見ないと絵と動きが食い違う
  if (grabHandle(p)) {
    setCursor(model.selected?.kind === 'divider' ? 'nwse-resize' : 'ew-resize');
    return;
  }
  const hit = model.pick(p.x, p.y);
  if (!hit) {
    setCursor('crosshair');
    return;
  }
  if (model.grabMode(p.x, p.y, hit) === 'move') {
    setCursor('move');
    return;
  }
  // 端をつかむ＝長さを変える。仕切りは端点を斜めにも動かせるので斜めの矢印にする
  setCursor(hit.kind === 'divider' ? 'nwse-resize' : 'ew-resize');
}

boardEl.addEventListener('pointermove', (e) => {
  // ⚠️ カーソルの更新はドラッグしていない時だけ（掴んでいる間は絵を固定する）
  if (!grab) updateCursor(toLogical(e));
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

/**
 * キーボードの割り当て（2026-07-27 れいあ要望「Deleteで消したい・ショートカットが欲しい」）。
 * 一覧は `editor.html` の「キーボードで速くやる」に出してある（両方直すこと）。
 *
 * ⚠️ **入力欄にいる間は何もしない**。名前を打っている最中に G で「ゲートを足す」が
 *    走ると、文字が入らないバグに見える。
 * ⚠️ 押したキーが割り当てに無ければ `preventDefault` しない（ブラウザの動きを奪わない）。
 */
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  // 保存は試遊中でも効かせる（⚠️ ブラウザの「ページを保存」を止める）
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    el<HTMLButtonElement>('save').click();
    return;
  }

  // 試遊中は「止める」だけ受ける（この間に配置を変えると何を見ているか分からなくなる）
  if (session) {
    if (e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      el<HTMLButtonElement>('play').click();
    }
    return;
  }

  // 選択が無くても効くもの＝追加と試遊
  const ADD: Record<string, string> = { g: 'add-gate', j: 'add-jumper', d: 'add-divider' };
  const addId = ADD[e.key.toLowerCase()];
  if (addId) {
    const btn = el<HTMLButtonElement>(addId);
    e.preventDefault();
    // ⚠️ 上限に達している時は押せない。黙って何も起きないと壊れて見えるので理由を出す
    if (btn.disabled) setStatus('これ以上は足せないよ（32個まで）');
    else btn.click();
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    el<HTMLButtonElement>('play').click();
    return;
  }

  if (!model.selected) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    el<HTMLButtonElement>('del').click();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    model.select(null);
    rebuild();
    syncPanel();
    return;
  }
  // 1〜5 でゲートの倍率（MULTIPLIERS と同じ並び＝×2 ×3 ×4 ×6 ×10）
  if (model.selected.kind === 'gate' && /^[1-5]$/.test(e.key)) {
    const n = MULTIPLIERS[Number(e.key) - 1];
    if (n !== undefined) {
      e.preventDefault();
      model.setMultiplier(n);
      rebuild();
      syncPanel();
      setStatus(`倍率を ×${n} にしたよ`);
    }
    return;
  }

  const dir = ARROWS[e.key];
  if (!dir) return;
  e.preventDefault();
  // 吸着の単位で動かす。Shift を押している間は5目盛りぶんまとめて
  const stepPx = CONFIG.EDITOR_GRID * (e.shiftKey ? 5 : 1);
  model.moveBy(dir[0] * stepPx, dir[1] * stepPx);
  rebuild();
  syncPanel();
});

// 固定するかの切り替え（ゲート＝倍率／ジャンプ台＝位置・2026-07-27 れいあ要望）
for (const id of ['fix-mult', 'fix-pos']) {
  el<HTMLInputElement>(id).addEventListener('change', () => {
    const on = el<HTMLInputElement>(id).checked;
    model.setFixed(on);
    const what = id === 'fix-mult' ? '倍率' : '位置';
    setStatus(on ? `${what}を固定したよ` : `${what}は始めるたびに抽選されるよ`);
  });
}

/**
 * キー操作の窓（2026-07-27 れいあ要望）。
 * ⚠️ **覆うモーダルにしない**＝出したまま盤面と数値をいじれる。
 * ⚠️ サイドバーの中に置くと数値欄との上下の往復が起きて読めない、というのが元の指摘。
 *    だから掴んで好きな所へ動かせる浮いた窓にしてある。
 * ⚠️ 置いた場所を覚える（毎回動かし直すのは手間）。画面の外に出た状態で覚えてしまうと
 *    次に開いた時に掴めなくなるので、**出す時に画面内へ引き戻す**。
 */
{
  const POS_KEY = 'marble-mill.keyhelp-pos';
  const panel = el<HTMLDivElement>('keyhelp-panel');
  const head = el<HTMLDivElement>('keyhelp-drag');

  const clampIntoView = (left: number, top: number): [number, number] => {
    const w = panel.offsetWidth || 306;
    // 端で完全に隠れないよう、掴む所が必ず64px以上見える範囲に収める
    return [
      Math.min(Math.max(left, 8 - w + 64), window.innerWidth - 64),
      Math.min(Math.max(top, 8), window.innerHeight - 40),
    ];
  };

  const place = (left: number, top: number): void => {
    const [l, t] = clampIntoView(left, top);
    panel.style.left = `${l}px`;
    panel.style.top = `${t}px`;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ left: l, top: t }));
    } catch {
      // 覚えられなくても使えるので何もしない
    }
  };

  const restore = (): void => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { left?: unknown; top?: unknown };
      if (typeof p.left === 'number' && typeof p.top === 'number') place(p.left, p.top);
    } catch {
      // 壊れていたら初期位置のまま
    }
  };

  el<HTMLButtonElement>('keyhelp-open').addEventListener('click', () => {
    panel.hidden = false;
    restore();
  });
  el<HTMLButtonElement>('keyhelp-close').addEventListener('click', () => {
    panel.hidden = true;
  });

  // 掴んで動かす。⚠️ 盤面のドラッグ処理に流さないよう、ここで止める
  let drag: { dx: number; dy: number } | null = null;
  head.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    e.stopPropagation();
    place(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  head.addEventListener('pointerup', () => {
    drag = null;
  });
  // 窓の中のクリックが盤面に届かないようにする（閉じる/選択の誤爆防止）
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
}

// ゲームへ戻る（2026-07-27 れいあ要望）
document.getElementById('to-game')!.addEventListener('click', () => {
  location.href = 'index.html';
});

// ── 右パネル ──
/** ⚠️ `CONFIG.GATE_MULTIPLIER_TABLE` の候補と揃えること（2026-07-27 に ×6 を追加） */
const MULTIPLIERS = [2, 3, 4, 6, 10];
/** 跳ね上限のよく使う値。ここを振ってラウンドの長さを探る */
const CAPACITIES = [50, 100, 200, 400];

function syncPanel(): void {
  const sel = model.selected;
  el<HTMLDivElement>('sel-none').hidden = !!sel;
  el<HTMLDivElement>('sel-panel').hidden = !sel;
  // ⚠️ 縦持ちの下パネルは**既定で畳んである**（つまみバー1行だけ＝盤面を最大にする）。
  //    部品を選ぶと操作パネルが出る。出し入れはCSS側（`#side.has-sel` / `#side.menu-open`）
  //    ＝PCの右パネルには効かない。
  // 🔴 **メニューは自動で開閉しない**（2026-07-28 れいあ要望）。開いたまま部品を選べる形にする
  //    ＝大きい画面で「メニューを見ながら盤面に置く」使い方を潰さないため。
  //    ⚠️ ここで `menu-open` を外さないこと（外すと「選んだら勝手に閉じた」になる）。
  const side = el<HTMLElement>('side');
  side.classList.toggle('has-sel', !!sel);
  syncMenuLabel();
  el<HTMLButtonElement>('add-gate').disabled = !model.canAddGate();
  el<HTMLButtonElement>('add-jumper').disabled = !model.canAddJumper();
  el<HTMLButtonElement>('add-divider').disabled = !model.canAddDivider();
  // つまみバー側も本体と同じ状態にする（押せないのに押せそうに見せない）
  el<HTMLButtonElement>('grip-gate').disabled = !model.canAddGate();
  el<HTMLButtonElement>('grip-jumper').disabled = !model.canAddJumper();
  el<HTMLButtonElement>('grip-divider').disabled = !model.canAddDivider();
  // ⚠️ 盤面の大きさが変わっていれば描き直す（`resize` は寸法が同じなら何もしない）。
  //    縦持ちではパネルを盤面に**重ねて**いるので普段はここで何も起きない＝画面が
  //    変わった時（回転など）とPCの右パネル側のための保険。
  renderer.resize();
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

  // 固定するかのチェック（ゲート＝倍率／ジャンプ台＝位置）
  const fixed = model.fixedOf(sel);
  if (fixed !== null) {
    el<HTMLInputElement>(sel.kind === 'gate' ? 'fix-mult' : 'fix-pos').checked = fixed;
  }

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

// 選択を外す（縦持ちで畳んだ群へ戻る口。⚠️ PCでは Esc があるのでボタンはCSSで隠してある）
el<HTMLButtonElement>('deselect').addEventListener('click', () => {
  model.select(null);
  rebuild();
  syncPanel();
});

// ── つまみバー（縦持ちでいつも見えている1行）──
/** メニューの口のラベル。開いている時は「閉じる」＝同じボタンで戻れると分かるようにする */
function syncMenuLabel(): void {
  const open = el<HTMLElement>('side').classList.contains('menu-open');
  el<HTMLButtonElement>('grip-menu').textContent = open ? '閉じる' : 'メニュー';
}

// ⚠️ 追加は本体のボタンへ**委譲**する（同じ処理を2か所に書かない。キー操作と同じやり方）
for (const [gripId, realId] of [
  ['grip-gate', 'add-gate'],
  ['grip-jumper', 'add-jumper'],
  ['grip-divider', 'add-divider'],
] as const) {
  el<HTMLButtonElement>(gripId).addEventListener('click', () => {
    el<HTMLButtonElement>(realId).click();
  });
}

/**
 * 数値の欄の出し入れ（縦持ちだけ・2026-07-28 れいあ実機「盤面が小さい」への手当て）。
 * ⚠️ 指で作る時は数値を使わない（端の丸を動かすと値が指の上に出る）ので既定は畳む。
 * ⚠️ 一度開いたら選択を変えても開いたまま（数値で詰めたい人がいちいち開き直さないように）。
 */
el<HTMLButtonElement>('nums-toggle').addEventListener('click', () => {
  const open = el<HTMLElement>('side').classList.toggle('nums-open');
  el<HTMLButtonElement>('nums-toggle').textContent = open ? '数値を閉じる' : '数値で合わせる';
  renderer.resize(); // 高さが変わる＝盤面の大きさも変わる
});

/**
 * メニュー（保存・追加・試し撃ち）の出し入れ。
 *
 * 🔴 **部品を選んでも勝手には開かない**（2026-07-28 れいあ「部品選択中は強制的にメニューが開く」）。
 *    盤面の上での操作＝選ぶ・動かす・伸ばす は**閉じたまま**できる＝盤面を大きく保つため。
 *    倍率や削除を触りたい時だけ自分で開く（開くと選択中の操作が `order` で一番上に出る）。
 * ⚠️ 高さは**pxで入れる**。`dvh` のままだと伸縮が補間されず「パッと出る」ことがある
 *    （れいあ端末で「アニメーションが再生されない」となった原因の1つ）。
 * ⚠️ `scrollHeight` は**中身を出してから**測る（隠している間は中身の高さが取れない）。
 * ⚠️ 閉じる時は空文字に戻す＝CSS側の 76px（つまみバー1行）へ縮む。
 */
function setMenuOpen(open: boolean): void {
  const side = el<HTMLElement>('side');
  side.classList.toggle('menu-open', open);
  const cap = Math.round(window.innerHeight * 0.6);
  side.style.maxHeight = open ? `${Math.min(side.scrollHeight, cap)}px` : '';
  syncMenuLabel();
  // ⚠️ ここで盤面を描き直さない。パネルは盤面に**重ねて**いるので大きさは変わらない
  //    （場所を取らせていた頃は開閉のたびに作り直していて、それが「ビューがパッと変わる」
  //     「閉じる時に2段階で戻る」の正体だった・2026-07-28）。
}

el<HTMLButtonElement>('grip-menu').addEventListener('click', () => {
  // ⚠️ **選択には触らない**＝部品を選んだままメニューを開け閉めできる
  setMenuOpen(!el<HTMLElement>('side').classList.contains('menu-open'));
});

// ⚠️ 試し撃ちを終えたら**メニューを開く**（2026-07-28 れいあ要望）。終えた直後にやりたいのは
//    「保存」か「配置の直し」なので、畳んだままだと必ずもう1タップ増える。
el<HTMLButtonElement>('grip-stop').addEventListener('click', () => {
  el<HTMLButtonElement>('play').click(); // 試し撃ちを終える（`stopPlay` が走る）
  setMenuOpen(true);
});

el<HTMLButtonElement>('reset').addEventListener('click', () => {
  stopPlay();
  model = new EditorModel(structuredClone(DEFAULT_STAGE_DEF));
  el<HTMLInputElement>('name').value = model.def.name;
  rebuild();
  syncPanel();
  setStatus('最初の配置に戻したよ');
});

// ── 保存・読み込み ──
/**
 * 保存の行き先は2つあり、**混ぜない**（2026-07-27）。
 * - 開発中（`import.meta.env.DEV`）… 開発サーバーの口 → `src/stages/*.json`
 *   ＝リアが量産して**製品に同梱する型**の経路。今までどおり。
 * - 公開版 … `localStorage` ＝**プレイヤーの端末の中だけ**にある型。
 * ⚠️ 両方に書く二重保存はしない（どちらが正か分からなくなる）。
 * ⚠️ 公開版の挙動を手元で見たい時は `npm run preview`（本番ビルドを配信）で開く。
 */
const SAVE_TO_FILE = import.meta.env.DEV;

/** 一覧に出す1行。`value` は開く時に引くキー、`label` は印つきの表示 */
interface StageRow {
  value: string;
  label: string;
}

/**
 * はじめから入っている型（テンプレート）を指す印。
 * ⚠️ 自分の型と同じ名前でも取り違えないよう、`value` に前置きして区別する
 *    （`label` には出さない＝画面には型名だけ見せる）。
 */
const BUILTIN = 'builtin:';

function myStageRows(): StageRow[] {
  return loadMyStages().map((s) => ({
    value: s.def.name,
    // 出どころの印。⚠️ 印は表示だけに付ける（value に混ぜると名前で引けなくなる）
    label: s.from === 'link' ? `${s.def.name}（もらった型）` : s.def.name,
  }));
}

async function fileStageRows(): Promise<StageRow[]> {
  const res = await fetch('/__stages');
  const names: string[] = (await res.json())?.stages ?? [];
  return names.map((n) => ({ value: n, label: n }));
}

async function refreshStageList(): Promise<void> {
  const box = el<HTMLSelectElement>('open-name');
  const keep = box.value;
  let saved: StageRow[] = [];
  try {
    saved = SAVE_TO_FILE ? await fileStageRows() : myStageRows();
  } catch {
    // 開発サーバーが居ない開発モード（ほぼ無いが、口が落ちている時）
    setStatus('保存済みの一覧が取れなかったよ');
  }
  // はじめから入っている型をテンプレートとして出す（2026-07-27 れいあ要望）
  const builtin: StageRow[] = STAGES.map((s) => ({ value: `${BUILTIN}${s.name}`, label: s.name }));

  // 🔴 型名は**他人が書いた文字列**になりうる（リンクでもらった型）。
  //    innerHTML に埋めず、必ず textContent で入れる。
  const mkOption = (r: StageRow): HTMLOptionElement => {
    const o = document.createElement('option');
    o.value = r.value;
    o.textContent = r.label;
    return o;
  };
  const groups: [string, StageRow[]][] = [
    [SAVE_TO_FILE ? '保存した型' : '自分の型', saved],
    ['はじめから入っている型（テンプレート）', builtin],
  ];
  box.replaceChildren(
    ...groups
      .filter(([, rows]) => rows.length > 0)
      .map(([label, rows]) => {
        const g = document.createElement('optgroup');
        g.label = label;
        g.append(...rows.map(mkOption));
        return g;
      }),
  );
  if ([...box.options].some((o) => o.value === keep)) box.value = keep;
  syncListButtons();
  syncMineOnly();
}

/**
 * 一覧の下のボタンの有効・無効。
 * ⚠️ **消せるのは端末に保存した自分の型だけ**。はじめから入っている型と、
 *    開発中のファイル保存ぶんは消させない（消してよいものと分けておく）。
 */
function syncListButtons(): void {
  const v = el<HTMLSelectElement>('open-name').value;
  el<HTMLButtonElement>('open').disabled = !v;
  el<HTMLButtonElement>('del-stage').disabled = !v || v.startsWith(BUILTIN) || SAVE_TO_FILE;
}

el<HTMLSelectElement>('open-name').addEventListener('change', syncListButtons);

/**
 * 「自分の型だけで遊ぶ」の状態を画面に反映する。
 * ⚠️ 端末に保存した型が0個の時は**押せないようにする**。オンにすると遊べる型がゼロになる。
 * ⚠️ 開発中の保存先はファイル（`src/stages/*.json`）なので、開発中に作った型はここでは
 *    数に入らない。対象は「端末に保存した型」だけ＝ヒントにもそう書く。
 */
function syncMineOnly(): void {
  const box = el<HTMLInputElement>('mine-only');
  const count = loadMyStages().length;
  box.disabled = count === 0;
  box.checked = loadMineOnly() && count > 0;
  el<HTMLDivElement>('mine-only-hint').textContent =
    count === 0
      ? '端末に型を1つ保存すると選べるようになるよ'
      : box.checked
        ? `いま ${count}個の自分の型だけでゲームが回るよ`
        : `オフの間は、はじめから入っている型と混ざって出るよ（自分の型は${count}個）`;
}

el<HTMLInputElement>('mine-only').addEventListener('change', () => {
  saveMineOnly(el<HTMLInputElement>('mine-only').checked);
  syncMineOnly();
});

el<HTMLButtonElement>('save').addEventListener('click', async () => {
  const def: StageDef = { ...model.def, name: el<HTMLInputElement>('name').value.trim() };
  if (!def.name) {
    setStatus('名前を入れてね');
    return;
  }

  if (!SAVE_TO_FILE) {
    const r = saveMyStage(def, 'me');
    if (!r.ok) {
      setStatus(`型は${MY_STAGE_MAX}個までだよ。どれか消してから保存してね`);
      return;
    }
    model.def.name = r.name;
    el<HTMLInputElement>('name').value = r.name;
    await refreshStageList();
    el<HTMLSelectElement>('open-name').value = r.name;
    setStatus(`保存したよ（${loadMyStages().length}/${MY_STAGE_MAX}個）`);
    return;
  }

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

  // はじめから入っている型をテンプレートとして開く
  if (name.startsWith(BUILTIN)) {
    const src = STAGES.find((s) => s.name === name.slice(BUILTIN.length));
    if (!src) {
      setStatus('その型は見つからなかったよ');
      await refreshStageList();
      return;
    }
    stopPlay();
    // ⚠️ **必ず複製して渡す**。STAGES は本体と共有している配列なので、
    //    そのまま編集するとゲーム側で遊べる型まで書き換わる。
    model.load(structuredClone(src));
    // ⚠️ 公開版では「〜のコピー」にする＝そのまま保存した時に、元の型を
    //    書き換えたように見えるのを防ぐ（実際には端末側に別で入る）。
    //    開発中は元の型そのものを直す運用なので名前を変えない。
    const asName = SAVE_TO_FILE ? src.name : `${src.name} のコピー`;
    model.def.name = asName;
    el<HTMLInputElement>('name').value = asName;
    rebuild();
    syncPanel();
    setStatus(`${src.name} をテンプレートとして開いたよ`);
    return;
  }

  if (!SAVE_TO_FILE) {
    const found = loadMyStages().find((s) => s.def.name === name);
    if (!found) {
      setStatus('その型は見つからなかったよ');
      await refreshStageList();
      return;
    }
    stopPlay();
    model.load(found.def); // 読み出しの時点で normalizeStageDef を通してある
    el<HTMLInputElement>('name').value = model.def.name;
    rebuild();
    syncPanel();
    setStatus(`${name} を開いたよ`);
    return;
  }

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

// 端末に保存した型を消す（開発中はファイルを扱うのでこのボタンは無効）
el<HTMLButtonElement>('del-stage').addEventListener('click', async () => {
  const name = el<HTMLSelectElement>('open-name').value;
  if (!name || SAVE_TO_FILE) return;
  removeMyStage(name);
  await refreshStageList();
  setStatus(`${name} を消したよ（${loadMyStages().length}/${MY_STAGE_MAX}個）`);
});

// ── 試し撃ち ──
function stopPlay(): void {
  if (!session) return;
  session = null;
  const btn = el<HTMLButtonElement>('play');
  btn.textContent = '試遊する';
  btn.classList.remove('on');
  // ⚠️ つまみバーを元に戻す（「試し撃ちを終了」だけの状態から）
  el<HTMLElement>('side').classList.remove('playing');
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
  // ⚠️ 試し撃ちの間はパネルを畳んで盤面だけにする（2026-07-28 れいあ要望）。
  //    選択の枠も外す＝この間は配置を触らないので、出しておくと邪魔になるだけ。
  el<HTMLElement>('side').classList.add('playing');
  model.select(null);
  syncPanel();
  setMenuOpen(false);
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

window.addEventListener('resize', () => {
  renderer.resize();
  // ⚠️ 開いている時の高さは px で入れてあるので、画面が変わったら測り直す（回転で崩れる）
  if (el<HTMLElement>('side').classList.contains('menu-open')) setMenuOpen(true);
});
