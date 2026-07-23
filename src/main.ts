import { CONFIG } from './core/config';
import { Session } from './core/session';
import { CanvasRenderer } from './render/canvasRenderer';
import { Hud } from './ui/hud';

const stageEl = document.getElementById('stage')!;
const hintEl = document.getElementById('hint')!;
const renderer = new CanvasRenderer();
const hud = new Hud();

let session = new Session();
let speed = 1;
let shownResult = false;
let ready = false;

function moveCup(clientX: number): void {
  session.setCupX(renderer.toLogicalX(clientX));
}

stageEl.addEventListener('pointerdown', (e) => {
  stageEl.setPointerCapture(e.pointerId);
  moveCup(e.clientX);
  session.start(); // 最初のタップで落ち始める
  hintEl.textContent = 'なぞってコップを動かす';
});
stageEl.addEventListener('pointermove', (e) => {
  // マウスは押している間だけ、指はそのまま追従させる
  if (e.pointerType === 'mouse' && e.buttons === 0) return;
  moveCup(e.clientX);
});

function restart(): void {
  session = new Session();
  shownResult = false;
  hud.hideResult();
  hintEl.textContent = '画面をタップすると始まるよ';
}

document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((o) => {
      o.classList.toggle('active', Number(o.dataset.speed) === speed);
    });
  });
});
document.getElementById('retry')!.addEventListener('click', restart);
document.getElementById('again')!.addEventListener('click', restart);
window.addEventListener('resize', () => renderer.resize());

function loop(): void {
  session.update(speed);
  if (ready) {
    renderer.draw(session.pool, CONFIG.BALL_RADIUS, session.stage, session.cupX);
  }
  hud.setScore(session.score);

  if (session.finished && !shownResult) {
    shownResult = true;
    hud.showResult(session.score);
  }
  requestAnimationFrame(loop);
}

void renderer.init(stageEl, session.world).then(() => {
  ready = true;
  requestAnimationFrame(loop);
});
