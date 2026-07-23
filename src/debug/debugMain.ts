import { CONFIG } from '../core/config';
import { createDebugStage, type DebugPreset } from '../core/debugStage';
import { Session } from '../core/session';
import { CanvasRenderer } from '../render/canvasRenderer';

const stageEl = document.getElementById('stage')!;
const statEl = document.getElementById('stat')!;
const gatesEl = document.getElementById('gates')!;
const ballsEl = document.getElementById('balls')!;
const renderer = new CanvasRenderer();

let preset: DebugPreset = 'single-gate';
let playing = false;
let ready = false;
// ⚠️ makeSession() より前に宣言すること（中で参照するため）
let frame = 0;
let lastCount = 0;
let lastJump = '-';
let session = makeSession();

/** 供給はボタンで手動。自動で降ってくると何が起きたか追えない */
function makeSession(): Session {
  frame = 0;
  lastCount = 0;
  lastJump = '-';
  return new Session(createDebugStage(preset), { maxBalls: 4000, initialBalls: 0 });
}

function dropOne(): void {
  session.start();
  session.pool.spawn(session.cupX, CONFIG.BALL_RADIUS * 4);
}

function advance(frames: number): void {
  for (let i = 0; i < frames; i++) {
    const before = session.pool.activeCount;
    const beforeBounce = maxBounce();
    session.update(1);
    frame++;
    const grew = session.pool.activeCount - before;
    if (grew > 0) lastCount = grew;
    if (maxBounce() > beforeBounce) lastJump = `f${frame}`;
  }
}

function maxBounce(): number {
  let m = 0;
  session.pool.forEachActive((b) => {
    if (b.bounce > m) m = b.bounce;
  });
  return m;
}

function maskText(mask: number, gateCount: number): string {
  if (gateCount === 0) return '-';
  let out = '';
  for (let i = 0; i < gateCount; i++) out += mask & (1 << i) ? '●' : '○';
  return out;
}

function refresh(): void {
  const awake = session.awakeCount;
  statEl.innerHTML =
    `フレーム <b>${frame}</b>　玉 <b>${session.pool.activeCount}</b>　` +
    `動いてる <b>${awake}</b>　スコア <b>${session.score.toLocaleString('ja-JP')}</b>　` +
    `直近の増加 <b>+${lastCount}</b>　跳ねた <b>${lastJump}</b>`;

  gatesEl.innerHTML = session.stage.gates
    .map((g) => {
      const active = g.used < g.capacity;
      const cap = g.capacity >= 1e9 ? '∞' : g.capacity.toLocaleString('ja-JP');
      return (
        `<div class="stat">ゲート${g.id} ×${g.multiplier}　` +
        `使用 <b>${g.used.toLocaleString('ja-JP')}</b> / ${cap}　` +
        `${active ? '有効' : '<span style="color:#ff9f7a">使い切り</span>'}</div>`
      );
    })
    .join('');

  const gateCount = session.stage.gates.length;
  const rows: string[] = [];
  let i = 0;
  session.pool.forEachActive((b) => {
    if (i >= 24) return;
    rows.push(
      `<tr>
        <td>${i}</td>
        <td>${b.x.toFixed(0)}</td>
        <td>${b.y.toFixed(0)}</td>
        <td>${b.weight}</td>
        <td class="${b.gateMask === 0 ? 'new' : 'used'}">${maskText(b.gateMask, gateCount)}</td>
        <td>${b.bounce}</td>
        <td>${b.sleeping ? '眠' : '動'}</td>
      </tr>`,
    );
    i++;
  });
  if (session.pool.activeCount > 24) {
    rows.push(`<tr><td colspan="7">… 他 ${session.pool.activeCount - 24} 個</td></tr>`);
  }
  ballsEl.innerHTML = rows.join('');
}

function setPreset(p: DebugPreset): void {
  preset = p;
  setPlaying(false);
  session = makeSession();
  document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
    b.classList.toggle('active', b.dataset.preset === p);
  });
  void renderer.init(stageEl, session.world);
  refresh();
}

document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
  b.addEventListener('click', () => setPreset(b.dataset.preset as DebugPreset));
});
document.getElementById('reset')!.addEventListener('click', () => {
  setPlaying(false);
  session = makeSession();
  refresh();
});
document.getElementById('drop')!.addEventListener('click', () => {
  dropOne();
  // 「落とす」と書いてある以上、押したら実際に落ち始めてほしい。
  // 止めたい時は「停止」、1コマずつ見たい時は停止してから「1フレーム」。
  setPlaying(true);
  refresh();
});
document.getElementById('stepone')!.addEventListener('click', () => {
  setPlaying(false); // コマ送りしたいので自動再生は止める
  advance(1);
  refresh();
});
document.getElementById('step10')!.addEventListener('click', () => {
  setPlaying(false);
  advance(10);
  refresh();
});
const playBtn = document.getElementById('play') as HTMLButtonElement;

function setPlaying(v: boolean): void {
  playing = v;
  playBtn.textContent = playing ? '停止' : '再生';
  playBtn.classList.toggle('active', playing);
}

playBtn.addEventListener('click', () => setPlaying(!playing));

stageEl.addEventListener('pointerdown', (e) => {
  session.setCupX(renderer.toLogicalX(e.clientX));
  refresh();
});
window.addEventListener('resize', () => renderer.resize());

function loop(): void {
  if (playing) {
    advance(1);
    refresh();
  }
  if (ready) {
    renderer.draw(session.pool, CONFIG.BALL_RADIUS, session.stage, session.cupX);
  }
  requestAnimationFrame(loop);
}

void renderer.init(stageEl, session.world).then(() => {
  ready = true;
  refresh();
  requestAnimationFrame(loop);
});
