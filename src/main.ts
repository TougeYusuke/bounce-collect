import { CONFIG } from './core/config';
import { Match } from './core/match';
import { CanvasRenderer } from './render/canvasRenderer';
import { loadArt } from './render/art';
import { MATERIALS, pickMaterial, type Material } from './render/theme';
import { confirmDialog } from './ui/dialog';
import { Hud } from './ui/hud';
import {
  getScreen,
  renderResult,
  renderScoresList,
  renderTitleScores,
  renderTitleTotal,
  renderTotalRanking,
  showScreen,
} from './ui/screens';
import { addScore } from './ui/scores';
import { addTotal } from './ui/totals';

const stageEl = document.getElementById('stage')!;
const hintEl = document.getElementById('hint')!;
const renderer = new CanvasRenderer();
const hud = new Hud();

const SPEEDS = [1, 2, 4] as const;
let match = new Match();
let material: Material = MATERIALS[0];
let speed = 1;
let shownResult = false;
let ready = false;
let cupTilt = 0; // 上バケツの傾き（ラジアン）。タップ後はそのラウンド中ずっと傾けたまま

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
  match = new Match();
  speed = 1;
  updateSpeedButton();
  shownResult = false;
  cupTilt = 0; // 新ラウンドは直立から。最初のタップで傾き始める
  showScreen('play');
}

function moveCup(clientX: number): void {
  match.setCupX(renderer.toLogicalX(clientX));
}

// 毎フレーム textContent を書き換えると無駄なので、変わった時だけ
let shownHint = '';
function setHint(v: string): void {
  if (v === shownHint) return;
  shownHint = v;
  hintEl.textContent = v;
}

// ── プレイ中の操作 ──
stageEl.addEventListener('pointerdown', (e) => {
  if (getScreen() !== 'play') return; // オーバーレイ表示中は盤面を操作しない
  stageEl.setPointerCapture(e.pointerId);
  moveCup(e.clientX);
  match.start();
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
    `いま出てる ${match.displayScore.toLocaleString('ja-JP')} 点は記録されずに消えるよ。`,
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
document.getElementById('title-total')!.addEventListener('click', () => {
  renderTotalRanking();
  showScreen('total');
});
document.getElementById('title-editor')!.addEventListener('click', async () => {
  // ステージエディタは次フェーズ。今は入口だけ確保してある
  await confirmDialog('ステージエディタ', '次のアップデートで作るよ。もう少し待ってね！', 'とじる');
});

// タイトルへ戻る（ハイスコアTOP5と添えトータルを描き直してから表示）
function goToTitle(): void {
  renderTitleScores();
  renderTitleTotal();
  showScreen('title');
}

// ── リザルト ──
document.getElementById('result-title')!.addEventListener('click', goToTitle);
document.getElementById('result-retry')!.addEventListener('click', newRound);

// ── ハイスコア一覧 ／ トータルランキング（どちらも戻るはタイトルへ） ──
document.getElementById('scores-back')!.addEventListener('click', goToTitle);
document.getElementById('total-back')!.addEventListener('click', goToTitle);

// HUD（スコア・ボタン）を盤面の幅に合わせる。
// PCの横長画面で画面端に散らばらず、盤面の縁に沿うようにする。
const hudEl = document.getElementById('hud') as HTMLDivElement;
function layoutHud(): void {
  const r = renderer.boardRectCss();
  hudEl.style.left = `${r.left}px`;
  hudEl.style.right = 'auto';
  hudEl.style.width = `${r.width}px`;
}

window.addEventListener('resize', () => {
  renderer.resize();
  layoutHud();
});

// タップして玉を出し始めたら、上バケツは傾けたままにする（注いだ後もその姿勢を保つ）。
// 目標角へイージングで寄せるので「じわっと傾く」動きになる。新ラウンドで直立に戻る。
const CUP_POUR_TILT = 1.4; // ラジアン（約80度）

function loop(): void {
  match.update(speed);
  if (ready) {
    const target = match.session.started ? CUP_POUR_TILT : 0;
    cupTilt += (target - cupTilt) * 0.15;
    // R1→R2は「カメラが下へ降りていく」場面転換にする。
    // 前半でR1の盤面（下バケツごと）が上へ抜け、後半で次の盤面が下から入ってくる。
    const p = match.transitionProgress;
    if (match.transitioning) {
      const half = p < 0.5;
      renderer.boardOffsetY = half
        ? -(p * 2) * CONFIG.BOARD_HEIGHT // 0 → -720（上へ抜ける）
        : (1 - (p - 0.5) * 2) * CONFIG.BOARD_HEIGHT; // +720 → 0（下から入る）
      renderer.showBottomBucket = half; // 前半だけR1のバケツを見せる
    } else {
      renderer.boardOffsetY = 0;
      renderer.showBottomBucket = match.round === 1;
    }
    renderer.bottomBucketOffsetY = 0;
    // コップに残っている玉の数（タップ前と出し切る前だけ意味がある）
    renderer.cupCount = match.session.remaining > 0 ? match.session.remaining : null;
    renderer.draw(match.session.pool, CONFIG.BALL_RADIUS, match.session.stage, match.cupX, cupTilt);
  }
  hud.setScore(match.displayScore);
  // R1は積み上げた弾、R2は最終スコア。数字の意味が変わるのでラベルで示す
  hud.setLabel(match.round === 1 ? 'BALLS' : 'SCORE');
  // R2もタップ待ちなので、待っている間はその案内に戻す
  setHint(match.session.started ? 'なぞってコップを動かす' : '画面をタップすると始まるよ');

  if (match.finished && !shownResult) {
    shownResult = true;
    // ⚠️ トータルはハイスコアの前に加算する（renderResult が加算後の累積を表示するため）
    addTotal(match.finalScore);
    const rank = addScore({ score: match.finalScore, date: today(), material: material.name });
    renderResult(match.finalScore, rank);
  }
  requestAnimationFrame(loop);
}

void renderer.init(stageEl, match.session.world).then(() =>
  loadArt([...MATERIALS.map((m) => m.board), 'bucket-wood.png']).then(() => {
    ready = true;
    layoutHud();
    goToTitle();
    requestAnimationFrame(loop);
  }),
);
