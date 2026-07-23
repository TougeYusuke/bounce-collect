import { CONFIG } from '../core/config';
import { Bench, type BenchCase, type RendererKind } from './bench';
import { PerfScene } from './perfScene';
import { CanvasRenderer } from '../render/canvasRenderer';
import type { Renderer } from '../render/types';

const stage = document.getElementById('stage')!;
const fpsEl = document.getElementById('fps')!;
const infoEl = document.getElementById('info')!;
const overlay = document.getElementById('overlay') as HTMLDivElement;
const ovTitle = document.getElementById('ov-title')!;
const ovBody = document.getElementById('ov-body')!;
const ovClose = document.getElementById('ov-close')!;

let scene = new PerfScene(2000);
let renderer: Renderer | null = null; // init 前に destroy を呼ばないよう null 始まり
let rendererKind: RendererKind = 'canvas';
let speed = 1;
/** レンダラの差し替え中は描画も計測も止める（init 前に draw を呼ぶとクラッシュする） */
let rendererReady = false;
let benchBusy = false;

const bench = new Bench();
// 2000 と「限界まで」は盤面の収容量が同じで結果も同じになるため、限界まで の1本に統合した
const BENCH_CASES: BenchCase[] = [
  { count: 500, renderer: 'canvas', label: '500' },
  { count: 1000, renderer: 'canvas', label: '1000' },
  { count: 99999, renderer: 'canvas', label: '限界まで' },
  { count: 500, renderer: 'pixi', label: '500' },
  { count: 1000, renderer: 'pixi', label: '1000' },
  { count: 99999, renderer: 'pixi', label: '限界まで' },
];

// ── FPS計測：直近60フレームの平均
const frameTimes: number[] = [];
let last = performance.now();
let currentFps = 0;

async function createRenderer(kind: RendererKind): Promise<Renderer> {
  if (kind === 'pixi') {
    // Pixi は必要になった時だけ読み込む（Canvas しか試さない人に重い読み込みをさせない）
    const { PixiRenderer } = await import('../render/pixiRenderer');
    return new PixiRenderer();
  }
  return new CanvasRenderer();
}

async function setRenderer(kind: RendererKind): Promise<void> {
  rendererReady = false;
  const next = await createRenderer(kind);
  renderer?.destroy();
  renderer = next;
  rendererKind = kind;
  await renderer.init(stage, scene.world);
  rendererReady = true;
  syncButtons();
}

function reset(count = scene.target): void {
  scene = new PerfScene(count);
  frameTimes.length = 0;
  syncButtons();
}

function syncButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-count]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.count) === scene.target);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-renderer]').forEach((b) => {
    b.classList.toggle('active', b.dataset.renderer === rendererKind);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.speed) === speed);
  });
}

/**
 * 自動計測の1条件ぶんをセットアップする。
 * 上から降らせず、盤面へ一気に並べる（積もるのを待たないための要）。
 */
async function applyCase(c: BenchCase): Promise<void> {
  benchBusy = true;
  scene = new PerfScene(Math.min(c.count, 6000));
  const placed = scene.prefill(c.count);
  bench.notifyPlaced(placed);
  if (c.renderer !== rendererKind) await setRenderer(c.renderer);
  frameTimes.length = 0;
  syncButtons();
  benchBusy = false;
}

function showProgress(): void {
  overlay.hidden = false;
  ovClose.textContent = 'やめる';
  ovTitle.textContent = '自動で計測してるよ';
  const c = bench.current;
  ovBody.innerHTML =
    `<div class="prog">${bench.progress}　玉 ${c?.count ?? '-'} / ${c?.renderer === 'pixi' ? 'Pixi' : 'Canvas'}</div>` +
    `<div class="hint">20秒くらいで終わるよ。このまま見ててね。</div>`;
}

function showResults(): void {
  overlay.hidden = false;
  ovClose.textContent = '閉じる';
  ovTitle.textContent = '計測おわり';
  ovBody.innerHTML =
    bench.toTableHtml() +
    `<div class="hint"><b>最低fps</b>＝盤面いっぱいの玉が一斉に崩れている、一番重い瞬間。` +
    `実際のゲームはこれより軽いので、ここが出ていれば大丈夫。<br>` +
    `この画面をスクショしてリアに渡してね。</div>`;
  try {
    localStorage.setItem('bench-results', JSON.stringify(bench.results));
  } catch {
    // 保存できなくても計測結果の表示には影響しないので握りつぶす
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-count]').forEach((b) => {
  b.addEventListener('click', () => reset(Number(b.dataset.count)));
});
document.querySelectorAll<HTMLButtonElement>('[data-renderer]').forEach((b) => {
  b.addEventListener('click', () => {
    void setRenderer(b.dataset.renderer as RendererKind);
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    syncButtons();
  });
});
document.getElementById('reset')!.addEventListener('click', () => reset());
document.getElementById('bench')!.addEventListener('click', () => {
  const first = bench.start(BENCH_CASES);
  if (!first) return;
  showProgress();
  void applyCase(first);
});
ovClose.addEventListener('click', () => {
  if (bench.running) bench.cancel();
  overlay.hidden = true;
});
window.addEventListener('resize', () => renderer?.resize());

function loop(now: number): void {
  const dt = now - last;
  last = now;
  if (dt > 0 && dt < 1000) {
    frameTimes.push(dt);
    if (frameTimes.length > 60) frameTimes.shift();
  }

  scene.update(speed, 8);
  if (rendererReady) renderer?.draw(scene.pool, CONFIG.BALL_RADIUS);

  if (frameTimes.length > 0) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    currentFps = 1000 / avg;
    fpsEl.textContent = `${currentFps.toFixed(1)} fps`;
    fpsEl.className = currentFps >= 50 ? 'ok' : currentFps >= 30 ? 'mid' : 'bad';
  }
  const awake = scene.pool.activeCount - scene.sleepingCount;
  infoEl.textContent =
    `玉 ${scene.pool.activeCount}/${scene.target}　動いてる ${awake}　` +
    `${renderer?.name ?? '-'}　${speed}x`;

  if (bench.running && !benchBusy && rendererReady && frameTimes.length >= 10) {
    const { next, finished } = bench.tick(currentFps, scene);
    if (finished) showResults();
    else if (next) {
      showProgress();
      void applyCase(next);
    }
  }

  requestAnimationFrame(loop);
}

// トップレベル await は tsconfig の target 次第で落ちるので使わない
void setRenderer('canvas').then(() => requestAnimationFrame(loop));
