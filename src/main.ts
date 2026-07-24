import { CONFIG } from './core/config';
import { Session } from './core/session';
import { CanvasRenderer } from './render/canvasRenderer';
import { loadArt } from './render/art';
import { MATERIALS, pickMaterial, type Material } from './render/theme';
import { confirmDialog } from './ui/dialog';
import { Hud } from './ui/hud';
import { getScreen, renderResult, renderScoresList, renderTitleScores, showScreen } from './ui/screens';
import { addScore } from './ui/scores';

const stageEl = document.getElementById('stage')!;
const hintEl = document.getElementById('hint')!;
const renderer = new CanvasRenderer();
const hud = new Hud();

const SPEEDS = [1, 2, 4] as const;
let session = new Session();
let material: Material = MATERIALS[0];
let speed = 1;
let shownResult = false;
let ready = false;

renderer.setMaterial(material);

/** ローカル日付を YYYY-MM-DD で */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 新しいラウンドを始める（テーマを引き直す） */
function newRound(): void {
  material = pickMaterial(Math.random);
  renderer.setMaterial(material);
  session = new Session();
  speed = 1;
  updateSpeedButton();
  shownResult = false;
  hintEl.textContent = '画面をタップすると始まるよ';
  showScreen('play');
}

function moveCup(clientX: number): void {
  session.setCupX(renderer.toLogicalX(clientX));
}

// ── プレイ中の操作 ──
stageEl.addEventListener('pointerdown', (e) => {
  if (getScreen() !== 'play') return; // オーバーレイ表示中は盤面を操作しない
  stageEl.setPointerCapture(e.pointerId);
  moveCup(e.clientX);
  session.start();
  hintEl.textContent = 'なぞってコップを動かす';
});
stageEl.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && e.buttons === 0) return;
  moveCup(e.clientX);
});

// ── 速度（タップでサイクル） ──
const speedBtn = document.getElementById('speed') as HTMLButtonElement;
function updateSpeedButton(): void {
  speedBtn.textContent = `${speed}×`;
}
speedBtn.addEventListener('click', () => {
  speed = SPEEDS[(SPEEDS.indexOf(speed as 1 | 2 | 4) + 1) % SPEEDS.length];
  updateSpeedButton();
});

// ── リスタート（確認ダイアログを挟む） ──
document.getElementById('restart')!.addEventListener('click', async () => {
  const ok = await confirmDialog(
    'もう一回やる？',
    `いま出てる ${session.score.toLocaleString('ja-JP')} 点は記録されずに消えるよ。`,
    'やり直す',
  );
  if (ok) newRound();
});

// ── タイトル ──
document.getElementById('title-play')!.addEventListener('click', newRound);
document.getElementById('title-scores')!.addEventListener('click', () => {
  renderScoresList();
  showScreen('scores');
});
document.getElementById('title-editor')!.addEventListener('click', async () => {
  // ステージエディタは次フェーズ。今は入口だけ確保してある
  await confirmDialog('ステージエディタ', '次のアップデートで作るよ。もう少し待ってね！', 'とじる');
});

// ── リザルト ──
document.getElementById('result-title')!.addEventListener('click', () => {
  renderTitleScores();
  showScreen('title');
});
document.getElementById('result-retry')!.addEventListener('click', newRound);

// ── ハイスコア一覧 ──
document.getElementById('scores-back')!.addEventListener('click', () => {
  renderTitleScores();
  showScreen('title');
});

window.addEventListener('resize', () => renderer.resize());

function loop(): void {
  session.update(speed);
  if (ready) {
    renderer.draw(session.pool, CONFIG.BALL_RADIUS, session.stage, session.cupX);
  }
  hud.setScore(session.score);

  if (session.finished && !shownResult) {
    shownResult = true;
    const rank = addScore({ score: session.score, date: today(), material: material.name });
    renderResult(session.score, rank);
  }
  requestAnimationFrame(loop);
}

void renderer.init(stageEl, session.world).then(() =>
  loadArt([...MATERIALS.map((m) => m.board), 'bucket-wood.png']).then(() => {
    ready = true;
    renderTitleScores();
    showScreen('title');
    requestAnimationFrame(loop);
  }),
);
