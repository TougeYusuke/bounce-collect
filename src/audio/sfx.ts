/**
 * 効果音。⚠️ **音のファイルは1つも持たない**（Web Audio API で合成する）。
 *
 * 🔑 素材を増やさない方針は、器の絵を輪郭描画にしたのと同じ考え方
 *    （種類を足すたびに素材の手間が増える形にしない）。
 *    読み込み量も1バイトも増えない（2026-07-25 に 19MB → 2.4MB へ削ったのを守る）。
 *
 * ⚠️ **ブラウザは最初のユーザー操作まで音を鳴らせない**（自動再生制限）。
 *    `unlock()` を最初のタップで呼ぶこと。呼ぶ前の `play` は黙って捨てられる。
 */

/**
 * 音の種類。
 * ⚠️ `unlock`（工房の解放）は**まだ鳴らす場所に繋いでいない**。
 *    まず盤面の3つ（増えた・跳ねた・回収）をれいあに聞いてもらってから足す。
 */
export type SfxName = 'gate' | 'jump' | 'collect' | 'unlock';

/**
 * 玉が増えた時の**泡の大きさ**（＝始まりの周波数Hzと長さ秒）。
 *
 * 🔑 れいあ要望 2026-07-26「**お湯が沸くような音にしたい**」。
 *    最初は和音（ドミソ）の電子音にしていたが、狙いは音階ではなく**沸騰の質感**だった。
 *
 * 🔑 泡の音の正体＝**周波数が短時間で上がっていく短いパルス**（気泡が弾ける時、
 *    泡が縮むにつれて共鳴が高くなる）。だから単音を鳴らすのではなく、上昇スイープで作る。
 * 🔑 **大きい泡ほど低くて長い**。倍率が大きい（＝たくさん増えた）ほど低い「ぼこっ」にすると、
 *    増えた量と音の重さが一致する。
 *
 * ⚠️ **150Hz を下回らないこと**（2026-07-26 れいあ「もう少し低い音にしたい」で全体を下げた）。
 *    スマホの小さいスピーカーは 300Hz あたりから急に出なくなるので、
 *    下げすぎると PC では良くても**スマホで何も聞こえなくなる**。
 */
const BUBBLE: Record<number, { hz: number; dur: number }> = {
  2: { hz: 400, dur: 0.06 },
  3: { hz: 320, dur: 0.07 },
  4: { hz: 245, dur: 0.09 },
  10: { hz: 158, dur: 0.14 },
};

/**
 * 音ごとの最小間隔（ミリ秒）＝**間引き**。
 *
 * ⚠️ これが無いと毎秒34回（増えた音）＋毎秒数十回（回収音）が全部鳴って音が潰れる。
 * 🔑 ただし**沸騰は「たくさん鳴る」のが持ち味**なので、単音だった頃より緩めてある
 *    （粒が減ると「お湯が沸いている」ではなく「時々ぽこっと鳴る」になってしまう）。
 */
const MIN_GAP_MS: Record<SfxName, number> = { gate: 32, jump: 70, collect: 28, unlock: 0 };

/**
 * 出口の掛け率。⚠️ 音量1.0 をそのまま流すと、泡が何十個も重なった時に割れる。
 *    「スライダー最大＝耳に痛くない上限」になるようここで抑える。
 */
const OUT = 0.45;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastAt: Record<string, number> = {};
  /**
   * 音量（0〜1）。⚠️ **0 がミュート**＝真偽値のミュートを別に持たない
   *    （2つ持つと「ミュート解除したのに音量0で鳴らない」が起きる）。
   * ⚠️ 出口で 0.45 を掛ける。大量に重なるので、1.0 をそのまま流すと割れる。
   */
  private volume = 0.6;

  /** ⚠️ 最初のユーザー操作（タップ）で呼ぶ。これより前は音が鳴らせない */
  unlockAudio(): void {
    if (this.ctx) {
      // ⚠️ タブを離れると suspended に落ちるので、触られるたびに起こす
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * OUT;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null; // 音が出せなくてもゲームは続ける
    }
  }

  /** 音量（0〜1）。0 でミュート */
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) {
      // ⚠️ いきなり値を置くとプチッと鳴るので、短い時定数で寄せる
      this.master.gain.setTargetAtTime(this.volume * OUT, this.ctx.currentTime, 0.02);
    }
  }

  get currentVolume(): number {
    return this.volume;
  }

  /** 間引きの判定だけ切り出したもの（テストできるように） */
  private allow(key: string, now: number, gapMs: number): boolean {
    const last = this.lastAt[key] ?? -Infinity;
    if (now - last < gapMs) return false;
    this.lastAt[key] = now;
    return true;
  }

  /**
   * 鳴らす。`detail` は音ごとの引数:
   *  - gate … ゲートの倍率（音程が決まる）
   *  - jump … 0〜1（跳ねる強さ。高いほど高く上がる音）
   */
  play(name: SfxName, detail = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.volume <= 0) return; // ⚠️ 音量0なら鳴らす処理ごと省く（Oscillatorを作らない）
    const now = ctx.currentTime * 1000;
    // ⚠️ 間引きは音の種類ごと。倍率違いの gate は別々に数える
    //    （同じ瞬間にドとソが鳴るのは濁らないので許す）
    if (!this.allow(`${name}:${name === 'gate' ? detail : ''}`, now, MIN_GAP_MS[name])) return;

    switch (name) {
      case 'gate': {
        const b = BUBBLE[detail] ?? BUBBLE[2];
        this.bubble(b.hz, b.dur, 0.55);
        break;
      }
      case 'jump':
        // 泡が一気に吹き上がる感じ。跳ねる勢いが強いほど高くまで上がる
        this.bubble(175, 0.18, 0.4, 3.0 + 1.4 * Math.min(1, Math.max(0, detail)));
        break;
      case 'collect':
        // ⚠️ 小さい泡。数千回鳴るので、鍋のふちで細かく弾けるくらいの存在感にする
        this.bubble(560, 0.035, 0.13);
        break;
      case 'unlock':
        // ごほうび（大きい泡が3つ続けて上がる）
        [160, 210, 280].forEach((hz, i) => this.bubble(hz, 0.16, 0.5, 2.4, i * 0.09));
        break;
    }
  }

  /**
   * 泡がひとつ弾ける音。
   *
   * 🔑 **周波数を上げながら素早く減衰させる**のが泡の正体（気泡が縮むと共鳴が高くなる）。
   *    上げずに鳴らすと、ただの「ピッ」という電子音になる。
   * ⚠️ 音程に**わずかなばらつき**を入れる。同じ倍率でいつも同じ高さだと機械的に並んで聞こえ、
   *    「沸いている」ではなく「一定のリズムで鳴っている」になる。
   *    （物理には乱数を使わない決まりだが、音は再現性が要らないので使ってよい）
   */
  private bubble(hz: number, dur: number, gain: number, rise = 2.2, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const f0 = hz * (0.86 + Math.random() * 0.28);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f0 * rise, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.003); // ⚠️ 0から立ち上げる（いきなり置くとプチッと鳴る）
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

}

export const sfx = new Sfx();
