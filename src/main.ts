import { CONFIG } from './core/config';
import { PerfScene } from './perf/perfScene';
import { CanvasRenderer } from './render/canvasRenderer';
import type { Renderer } from './render/types';

const stage = document.getElementById('stage')!;
const fpsEl = document.getElementById('fps')!;
const infoEl = document.getElementById('info')!;

type RendererKind = 'canvas' | 'pixi';

let scene = new PerfScene(2000);
let renderer: Renderer | null = null; // init 前に destroy を呼ばないよう null 始まり
let rendererKind: RendererKind = 'canvas';
let speed = 1;

// ── FPS計測：直近60フレームの平均
const frameTimes: number[] = [];
let last = performance.now();

async function createRenderer(kind: RendererKind): Promise<Renderer> {
  if (kind === 'pixi') {
    // Pixi は初回に押された時だけ読み込む（Canvas しか試さない場合に重い読み込みをさせない）
    const { PixiRenderer } = await import('./render/pixiRenderer');
    return new PixiRenderer();
  }
  return new CanvasRenderer();
}

async function setRenderer(kind: RendererKind): Promise<void> {
  const next = await createRenderer(kind);
  renderer?.destroy();
  renderer = next;
  rendererKind = kind;
  await renderer.init(stage, scene.world);
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
window.addEventListener('resize', () => renderer?.resize());

function loop(now: number): void {
  const dt = now - last;
  last = now;
  if (dt > 0 && dt < 1000) {
    frameTimes.push(dt);
    if (frameTimes.length > 60) frameTimes.shift();
  }

  scene.update(speed, 4);
  renderer?.draw(scene.pool, CONFIG.BALL_RADIUS);

  if (frameTimes.length > 0) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = 1000 / avg;
    fpsEl.textContent = `${fps.toFixed(1)} fps`;
    fpsEl.className = fps >= 50 ? 'ok' : fps >= 30 ? 'mid' : 'bad';
  }
  const awake = scene.pool.activeCount - scene.sleepingCount;
  infoEl.textContent =
    `玉 ${scene.pool.activeCount}/${scene.target}　動いてる ${awake}　` +
    `${renderer?.name ?? '-'}　${speed}x`;

  requestAnimationFrame(loop);
}

// トップレベル await は tsconfig の target 次第で落ちるので使わない
void setRenderer('canvas').then(() => requestAnimationFrame(loop));
