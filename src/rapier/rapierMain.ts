import { CONFIG } from '../core/config';
import { RapierScene, type BallView } from './rapierScene';

const stageEl = document.getElementById('stage')!;
const fpsEl = document.getElementById('fps')!;
const statEl = document.getElementById('stat')!;

const canvas = document.createElement('canvas');
canvas.style.position = 'absolute';
canvas.style.inset = '0';
stageEl.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

let angle = 15;
let friction = 0.02;
let scene: RapierScene | null = null;
let placed = 0;
const view: BallView[] = [];

let scale = 1;
let offsetX = 0;
let offsetY = 0;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  scale = Math.min(w / CONFIG.BOARD_WIDTH, h / CONFIG.BOARD_HEIGHT) * dpr;
  offsetX = (w * dpr - CONFIG.BOARD_WIDTH * scale) / 2;
  offsetY = (h * dpr - CONFIG.BOARD_HEIGHT * scale) / 2;
}
window.addEventListener('resize', resize);

function rebuild(): void {
  scene = new RapierScene({
    boardWidth: CONFIG.BOARD_WIDTH,
    boardHeight: CONFIG.BOARD_HEIGHT,
    ballRadius: CONFIG.BALL_RADIUS,
    angleDeg: angle,
    outletBalls: CONFIG.OUTLET_BALLS,
    friction,
    restitution: 0.1,
  });
  scene.build();
  placed = scene.prefill(CONFIG.MAX_BALLS);
  frameTimes.length = 0;
  syncButtons();
}

function syncButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-angle]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.angle) === angle);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-friction]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.friction) === friction);
  });
}

document.querySelectorAll<HTMLButtonElement>('[data-angle]').forEach((b) => {
  b.addEventListener('click', () => {
    angle = Number(b.dataset.angle);
    rebuild();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-friction]').forEach((b) => {
  b.addEventListener('click', () => {
    friction = Number(b.dataset.friction);
    rebuild();
  });
});
document.getElementById('reset')!.addEventListener('click', () => rebuild());

const frameTimes: number[] = [];
let last = performance.now();

function draw(): void {
  if (!scene) return;
  const r = CONFIG.BALL_RADIUS * scale;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#8b6a45';
  ctx.fillRect(offsetX, offsetY, CONFIG.BOARD_WIDTH * scale, CONFIG.BOARD_HEIGHT * scale);

  ctx.strokeStyle = '#5c4630';
  ctx.lineWidth = Math.max(2, 4 * scale);
  ctx.lineCap = 'round';
  for (const [ax, ay, bx, by] of scene.funnelLines) {
    ctx.beginPath();
    ctx.moveTo(offsetX + ax * scale, offsetY + ay * scale);
    ctx.lineTo(offsetX + bx * scale, offsetY + by * scale);
    ctx.stroke();
  }

  const n = scene.readBalls(view);
  ctx.fillStyle = '#eef3f7';
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(offsetX + view[i].x * scale, offsetY + view[i].y * scale, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function loop(now: number): void {
  const dt = now - last;
  last = now;
  if (dt > 0 && dt < 1000) {
    frameTimes.push(dt);
    if (frameTimes.length > 60) frameTimes.shift();
  }

  scene?.step();
  draw();

  if (frameTimes.length > 0) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = 1000 / avg;
    fpsEl.textContent = `${fps.toFixed(1)} fps`;
    fpsEl.className = fps >= 50 ? 'ok' : fps >= 30 ? 'mid' : 'bad';
  }
  if (scene) {
    const pct = placed > 0 ? ((scene.collected / placed) * 100).toFixed(0) : '0';
    statEl.innerHTML =
      `${angle}度 / 摩擦${friction}　置いた <b>${placed}</b>　` +
      `残り <b>${scene.activeCount}</b>　動いてる <b>${scene.awakeCount}</b>　` +
      `回収 <b>${scene.collected}</b>（${pct}%）`;
  }

  requestAnimationFrame(loop);
}

void RapierScene.load().then(() => {
  resize();
  rebuild();
  requestAnimationFrame(loop);
});
