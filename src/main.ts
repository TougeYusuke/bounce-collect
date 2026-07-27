import { CONFIG } from './core/config';
import { Match } from './core/match';
import { CanvasRenderer } from './render/canvasRenderer';
import { loadArt } from './render/art';
import {
  BALL_SKINS,
  BUCKET_IMAGES,
  MATERIALS,
  findBallSkin,
  findBucketSkin,
  pickMaterial,
  type Material,
} from './render/theme';
import { confirmDialog } from './ui/dialog';
import { Hud } from './ui/hud';
import { myStageDefs } from './core/myStages';
import { STAGES } from './core/stages';
import { RANDOM, unlockedKeys } from './core/workshop';
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
import {
  loadMineOnly,
  loadPrefs,
  loadSpeed,
  loadSupplyKey,
  loadVolume,
  saveSpeed,
  saveSupplyKey,
  saveVolume,
} from './ui/prefs';
import { sfx } from './audio/sfx';
import { SfxWatch } from './audio/sfxWatch';
import {
  DEFAULT_SUPPLY_KEY,
  SUPPLY_PRESETS,
  applySupplyPreset,
  resolveSupplyKey,
  supplyPreset,
} from './core/supplyPreset';
import { renderWorkshop } from './ui/workshopView';
import { addTotal, getTotal, resetTotal } from './ui/totals';

// URLに ?debug=1 を付けるとデバッグ表示が出る（ジャンプ台の残り回数など）
const DEBUG = new URLSearchParams(location.search).has('debug');
/**
 * 盛り上がりの実験プリセット。⚠️ **Match を作る前に当てる**
 * （`OUTLET_BALLS` はステージ構築時、`SPAWN_GROW_FRAMES` は Session 構築時にしか読まれない）。
 * ⚠️ デバッグ時だけ＝普通に開けば必ず既定の設定で動く。
 */
const supply = DEBUG
  ? applySupplyPreset(resolveSupplyKey(loadSupplyKey()))
  : supplyPreset(DEFAULT_SUPPLY_KEY);

const stageEl = document.getElementById('stage')!;
const hintEl = document.getElementById('hint')!;
const renderer = new CanvasRenderer();
const hud = new Hud();

let match = new Match();
const sfxWatch = new SfxWatch();
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
/**
 * 工房で解放済みのものだけを使う（2026-07-25）。
 * ⚠️ 解放の判定は累計スコアから計算する（別に保存しない）。
 *    core は localStorage を読まないので、ここで引いて渡す。
 */
function unlocked() {
  const total = getTotal();
  const themeKeys = unlockedKeys('theme', total);
  const stageKeys = new Set(unlockedKeys('stage', total));
  const ballKeys = unlockedKeys('ball', total);
  const bucketKeys = unlockedKeys('bucket', total);
  // ⚠️ 好みは持っていないものが選ばれていることがある（累計リセット後）。loadPrefs が落としてくれる
  const prefs = loadPrefs(ballKeys, themeKeys, bucketKeys);
  const owned = MATERIALS.filter((m) => themeKeys.includes(m.key));
  const mine = myStageDefs();
  const mineOnly = loadMineOnly() && mine.length > 0;
  return {
    // 「おまかせ」なら解放済みから抽選、指定があればそれだけ（＝毎回同じ素材で遊べる）
    materials: prefs.theme === RANDOM ? owned : owned.filter((m) => m.key === prefs.theme),
    // 🔴 自分で作った型は**解放判定を通さない**（自分で作ったものに鍵をかける意味がない）。
    //    ⚠️ 既定の型と同じ filter に入れてはいけない＝解放テーブルに名前が無いので**全部落ちる**。
    //    混ぜ方は等確率（2026-07-27 れいあ決定）。`pickStageDef` が配列から等確率で選ぶ。
    // ⚠️ 「自分の型だけ」は**自作が1個以上ある時だけ**効かせる。0個で効かせると遊べる型が
    //    ゼロになってゲームが始まらない。
    stages: mineOnly ? mine : [...STAGES.filter((s) => stageKeys.has(s.name)), ...mine],
    ball: findBallSkin(prefs.ball ?? BALL_SKINS[0].key),
    bucket: findBucketSkin(prefs.bucket),
    // 「おまかせ」かどうかは呼ぶ側で要る（投下前の反映で素材を振り直さないため）
    theme: prefs.theme,
  };
}

function newRound(): void {
  const open = unlocked();
  material = pickMaterial(Math.random, open.materials);
  renderer.setMaterial(material);
  renderer.setBallSkin(open.ball);
  renderer.setBucketSkin(open.bucket);
  match = new Match(undefined, open.stages);
  // ⚠️ 音の基準を捨てる。残したままだと、新しい盤面の最初のフレームで
  //    「増えた・跳ねた・回収した」が一気に立って音が固まって鳴る。
  sfxWatch.reset();
  // ⚠️ ここで速さを1×に戻さない（2026-07-26 れいあ要望「毎回設定するのは面倒」）。
  //    選んだ速さはラウンドをまたいで保つ。
  updateSpeedButton();
  shownResult = false;
  showScreen('play');
}

function moveCup(clientX: number): void {
  match.setCupX(renderer.toLogicalX(clientX));
}

// ⚠️ 0.5倍速はデバッグ時だけ。挙動をコマ送り気味に確かめるため（れいあ要望）
const SPEEDS: number[] = DEBUG ? [0.5, 1, 2, 4] : [1, 2, 4];
// 前に選んだ速さで始める。⚠️ いま選べない値（0.5はデバッグ時だけ）なら 1× に落ちる
speed = loadSpeed(SPEEDS, 1);
renderer.showDebug = DEBUG;
const debugEl = document.getElementById('debug')!;
debugEl.hidden = !DEBUG;

// ── 盛り上がりの実験プリセットの切り替え（?debug=1 の時だけ） ──
// ⚠️ 押したら**作り直す**（リロード）。ステージ構築時にしか読まない値があるので、
//    途中で差し替えると「効いていない設定」で遊ぶことになる。
const supplyEl = document.getElementById('supply-switch')!;
supplyEl.hidden = !DEBUG;
if (DEBUG) {
  const label = document.createElement('span');
  label.className = 'supply-label';
  label.textContent = '盛り上がり';
  supplyEl.append(label);
  for (const p of SUPPLY_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.name;
    b.title = p.hint;
    b.setAttribute('aria-pressed', String(p.key === supply.key));
    b.addEventListener('click', () => {
      if (p.key === supply.key) return;
      saveSupplyKey(p.key);
      location.reload();
    });
    supplyEl.append(b);
  }
  const hint = document.createElement('span');
  hint.className = 'supply-hint';
  hint.textContent = supply.hint;
  supplyEl.append(hint);
}

function updateDebug(): void {
  if (!DEBUG) return;
  const s = match.session;
  const jump = s.stage.jumpers
    .map((j, i) => `台${i + 1} 残${Math.max(0, j.capacity - j.used)}/${j.capacity}`)
    .join('　');
  // ⚠️ 型と種を出す。型も倍率も毎回抽選なので、これが無いと
  //    「さっきと何が違ったのか」をれいあが自分で確かめられない。
  // ⚠️ R1とR2は別の盤面なので、いま遊んでいる方を出す
  const def = match.currentDef;
  const mult = def.gates.map((g) => g.multiplier).join('/');
  debugEl.textContent =
    `型 ${def.name}　種 ${match.seed}　倍率 ${mult}\n` +
    `R${match.round}${match.transitioning ? '(転換中)' : ''}　` +
    `盤面 ${s.pool.activeCount}　配り ${s.supplied}/${s.supplyBalls}(${s.ballsPerSecond.toFixed(1)}個/秒)　` +
    `残量 ${s.remaining.toLocaleString('ja-JP')}　${Math.floor(s.elapsed / 60)}秒\n` +
    `回収 ${s.collectedBalls.toLocaleString('ja-JP')}個　${jump}` +
    (s.released ? '　板ぬけた' : '');
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

// ── 音 ──
// ⚠️ ブラウザは**最初のユーザー操作まで音を鳴らせない**（自動再生制限）。
//    どこを触っても有効化されるよう、キャプチャ段階で拾う。
const enableAudio = (): void => sfx.unlockAudio();
document.addEventListener('pointerdown', enableAudio, { capture: true });
document.addEventListener('keydown', enableAudio, { capture: true });

const soundBtn = document.getElementById('sound') as HTMLButtonElement;
const soundPanel = document.getElementById('sound-panel') as HTMLDivElement;
const volumeInput = document.getElementById('volume') as HTMLInputElement;
const volumeVal = document.getElementById('volume-val') as HTMLDivElement;

function applyVolume(v: number, save: boolean): void {
  sfx.setVolume(v);
  volumeInput.value = String(Math.round(v * 100));
  volumeVal.textContent = String(Math.round(v * 100));
  // ⚠️ 0 がミュート（ミュート専用のフラグは持たない）
  soundBtn.dataset.muted = String(v <= 0);
  if (save) saveVolume(v);
}
applyVolume(loadVolume(), false);

volumeInput.addEventListener('input', () => applyVolume(Number(volumeInput.value) / 100, true));
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  soundPanel.hidden = !soundPanel.hidden;
  soundBtn.setAttribute('aria-expanded', String(!soundPanel.hidden));
});
// パネルの外を触ったら閉じる。⚠️ パネル自身のクリックでは閉じない（スライダーを動かせなくなる）
document.addEventListener('click', (e) => {
  if (soundPanel.hidden) return;
  if (soundPanel.contains(e.target as Node)) return;
  soundPanel.hidden = true;
  soundBtn.setAttribute('aria-expanded', 'false');
});

// ── 速度（タップでサイクル） ──
const speedBtn = document.getElementById('speed') as HTMLButtonElement;
function updateSpeedButton(): void {
  speedBtn.textContent = `${speed}×`;
}
speedBtn.addEventListener('click', () => {
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  updateSpeedButton();
  saveSpeed(speed); // 次に開いた時もこの速さで始める
});
// ⚠️ 覚えている速さをボタンにも出す（ここで呼ばないと、起動直後だけ表示が 1× のままズレる）
updateSpeedButton();

// ── リスタート（確認ダイアログを挟む） ──
document.getElementById('restart')!.addEventListener('click', async () => {
  const ok = await confirmDialog(
    'もう一回やる？',
    `いま出てる ${match.displayScore.toLocaleString('ja-JP')} 点は記録されずに消えるよ。`,
    'やり直す',
  );
  if (ok) newRound();
});

// ── R1の投下前に工房を開く（2026-07-27 れいあ要望） ──
// ⚠️ プレイ中からタイトルへ戻る口は**持たない**（タイトルへ戻れるのはリザルトだけ・同要望）。
//    以前ここに置いていた `to-title` は廃止した。
const workshopFab = document.getElementById('workshop-fab') as HTMLButtonElement;
workshopFab.addEventListener('click', () => openWorkshop('play'));

// ── タイトル ──
document.getElementById('title-play')!.addEventListener('click', newRound);
document.getElementById('title-scores')!.addEventListener('click', () => {
  renderScoresList();
  showScreen('scores');
});
/**
 * 工房を開いた場所。戻るボタンはここへ返す（2026-07-27 れいあ要望）。
 * ⚠️ 以前は戻る先がタイトル固定だったので、遊ぶ流れの中で見た目を変えたい時に
 *    「タイトルへ戻る → 工房 → PLAY」と回り道になり、そのラウンドが作り直しになっていた。
 */
let workshopReturn: 'title' | 'play' = 'title';
function openWorkshop(from: 'title' | 'play'): void {
  workshopReturn = from;
  renderWorkshop();
  showScreen('workshop');
}
document.getElementById('title-workshop')!.addEventListener('click', () => openWorkshop('title'));
document.getElementById('workshop-back')!.addEventListener('click', () => {
  if (workshopReturn === 'play') {
    applyLooks();
    showScreen('play');
    return;
  }
  goToTitle();
});

/**
 * 投下前に工房で変えた見た目を、いま出ている盤面へその場で反映する。
 * 🔑 **Match は作り直さない**（作り直すとステージの型と中身まで抽選しなおしになり、
 *    「工房を閉じたら別の盤面になった」になる）。差し替えるのは絵だけ＝配置は不変。
 * ⚠️ 素材が「おまかせ」のままなら今の盤面の色を保つ（指定していないものを勝手に振り直さない）。
 */
function applyLooks(): void {
  const open = unlocked();
  if (open.theme !== RANDOM) {
    const picked = open.materials[0];
    if (picked && picked.key !== material.key) {
      material = picked;
      renderer.setMaterial(material);
    }
  }
  renderer.setBallSkin(open.ball);
  renderer.setBucketSkin(open.bucket);
}
// ⚠️ 押し間違いで進行が消えるので必ず確認を挟む（ネイティブconfirmは使わない）
document.getElementById('workshop-reset')!.addEventListener('click', async () => {
  const ok = await confirmDialog(
    'ビー玉をリセットする？',
    `貯まった ${getTotal().toLocaleString('ja-JP')} 個が0に戻って、解放したものも最初からになるよ。ハイスコアは消えません。`,
    'リセットする',
  );
  if (!ok) return;
  resetTotal();
  renderWorkshop();
});

document.getElementById('title-total')!.addEventListener('click', () => {
  renderTotalRanking();
  showScreen('total');
});
// ステージ工房（別ページ）。
// ⚠️ 公開版でも出す（2026-07-27）。`editor.html` は元から本番ビルドに同梱されていて
//    （`vite.config.ts` の rollupOptions.input）、入口を隠していただけだった。
//    保存先が端末側（localStorage）になったので、開発サーバーが無くても成立する。
document.getElementById('title-editor')!.addEventListener('click', () => {
  location.href = 'editor.html';
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
  // 工房の入口は**盤面の右下の角**に付ける（画面の端ではない）。
  // ⚠️ 画面端に置くとPCの横長画面で盤面から遠く離れる。CSSの幅と揃えること（82px）。
  const FAB = 82;
  const PAD = 14;
  workshopFab.style.left = `${r.left + r.width - FAB - PAD}px`;
  workshopFab.style.top = `${r.top + r.height - FAB - PAD}px`;
}

/**
 * 表示領域が変わったら作り直す。
 *
 * 🔑 **落ち着くまで測り直す**（れいあ実機 2026-07-26「スマホで横にした後に縦に戻すと画面が半分になる」）。
 * ⚠️ iOS は画面を回すと `resize` が**回転アニメーションの途中で**飛ぶので、その瞬間の高さは中間値。
 *    1回しか測らないと、その中間値のまま canvas が作られて**盤面が半分の高さで固まる**。
 * ⚠️ `orientationchange` だけに頼るのも駄目（発火時点ではまだ古いサイズを返す端末がある）。
 * ⚠️ `renderer.resize()` は**大きさが変わった時だけ**中身を作り直すので、何度呼んでも重くならない。
 */
let settleTimer = 0;
function scheduleResize(): void {
  renderer.resize();
  layoutHud();
  window.clearTimeout(settleTimer);
  let tries = 0;
  const tick = (): void => {
    renderer.resize();
    layoutHud();
    if (++tries < 8) settleTimer = window.setTimeout(tick, 100); // 800ms ぶん見張る（回転は約300ms）
  };
  settleTimer = window.setTimeout(tick, 100);
}

window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', scheduleResize);
// ⚠️ iOS はアドレスバーの伸縮でも表示領域が変わる。visualViewport が一番正確に拾える
window.visualViewport?.addEventListener('resize', scheduleResize);

// 0.5倍速は「2フレームに1回だけ進める」で表す（物理は1ステップ単位でしか進められない）
let halfTick = 0;

function loop(): void {
  // ⚠️ **プレイ画面の時だけ物理を進める**（2026-07-25）。
  //    画面に関わらず進めていたので、プレイ中にタイトルへ戻ると裏でラウンドが走り続け、
  //    数十秒後にリザルトが勝手に出てくる。止めておけば、次の PLAY で作り直される。
  //    ⚠️ 描画は止めない（タイトルの背景で盤面が固まって見えるのは問題ないが、
  //       止めると復帰時に1フレーム古い絵が残る）。
  if (getScreen() === 'play') {
    if (speed < 1) {
      halfTick++;
      if (halfTick % 2 === 0) match.update(1);
    } else {
      match.update(speed);
    }
    // ⚠️ 音は**進めた後**に見る（増えた・跳ねた・回収したの差分を拾うため）
    sfxWatch.tick(match.session);
  }
  if (ready) {
    // R1→R2は「カメラが下へ降りていく」場面転換にする。
    // 前半でR1の盤面（下バケツごと）が上へ抜け、後半で次の盤面が下から入ってくる。
    const p = match.transitionProgress;
    if (match.transitioning) {
      const half = p < 0.5;
      const k = half ? p * 2 : (p - 0.5) * 2; // 各半分の中での進み具合 0→1
      renderer.boardOffsetY = half
        ? -k * CONFIG.BOARD_HEIGHT // 0 → -720（盤面が上へ抜ける）
        : (1 - k) * CONFIG.BOARD_HEIGHT; // +720 → 0（次の盤面が下から入る）
      renderer.showBottomBucket = half; // 前半だけR1のバケツを見せる
      // ⚠️ 盤面と一緒に上へ流すと、積み上げた玉ごと上へ消えてしまう。
      //    盤面の動きを打ち消したうえで**下へ**運び、「この中身をそのまま次へ持っていく」
      //    ように見せる（れいあ要望）。
      renderer.bottomBucketOffsetY = half ? k * CONFIG.BOARD_HEIGHT + k * 140 : 0;
    } else {
      renderer.boardOffsetY = 0;
      renderer.bottomBucketOffsetY = 0;
      renderer.showBottomBucket = match.round === 1;
    }
    // コップに残っている玉の数（タップ前と出し切る前だけ意味がある）
    renderer.cupCount = match.session.remaining > 0 ? match.session.remaining : null;
    // ⚠️ 「次に出る玉」は描かない（2026-07-24 れいあ指摘で廃止）。
    //    出しておくと、玉が落ちている最中もずっと発生位置に玉が居座って見える。
    //    実際に落ちている玉だけを見せる。
    // ⚠️ 傾きは Session が持つ（描画は読むだけ）。タップ後にR1は横向き、R2は真下へ向く
    renderer.draw(
      match.session.pool,
      CONFIG.BALL_RADIUS,
      match.session.stage,
      match.cupX,
      match.cupTilt,
    );
  }
  hud.setScore(match.displayScore);
  // R1もR2も「回収した玉の個数」なのでラベルは共通（2026-07-24 スコアの定義を統一）
  hud.setLabel('SCORE');
  // R2もタップ待ちなので、待っている間はその案内に戻す
  setHint(match.session.started ? 'なぞってコップを動かす' : '画面をタップすると始まるよ');
  // 工房の入口は**R1の投下前だけ**出す。
  // ⚠️ R2のタップ待ちでは出さない（盤面に玉が居る状態で絵を焼き直すことになる／
  //    R2は同じラウンドの続きなので途中で見た目が変わるのはおかしい）。
  // ⚠️ `getScreen()` も見る＝この loop はプレイ中以外も回っているので、これが無いと
  //    タイトルやリザルトの上にボタンが浮いたままになる。
  workshopFab.hidden =
    getScreen() !== 'play' || match.session.started || match.session.mode !== 'r1';
  updateDebug();

  if (match.finished && !shownResult) {
    shownResult = true;
    // ⚠️ トータルはハイスコアの前に加算する（renderResult が加算後の累積を表示するため）
    addTotal(match.finalScore);
    const rank = addScore({ score: match.finalScore, date: today(), material: material.name });
    renderResult(match.finalScore, rank);
  }
  requestAnimationFrame(loop);
}

// ⚠️ 絵が揃うまでは**読み込み画面**を出したまま進み具合を見せる（2026-07-25）。
//    以前は真っ黒な盤面にHUDだけが浮いていて、壊れた画面に見えていた。
//    ⚠️ タイトルの背景もここで先に読む（CSSの url() と同じファイル＝タイトルに移った瞬間に出揃う）。
const loadFill = document.getElementById('load-bar-fill') as HTMLElement | null;
void renderer.init(stageEl, match.session.world).then(() =>
  loadArt(
    ['title-bg.jpg', ...MATERIALS.map((m) => m.board), ...BUCKET_IMAGES],
    (done, total) => {
      if (loadFill) loadFill.style.width = `${Math.round((done / total) * 100)}%`;
    },
  ).then(() => {
    ready = true;
    layoutHud();
    goToTitle();
    requestAnimationFrame(loop);
  }),
);
