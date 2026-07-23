import type { PerfScene } from './perfScene';

export type RendererKind = 'canvas' | 'pixi';

export interface BenchCase {
  /** 並べたい玉の数。盤面に入り切らなければ入るだけ置く */
  count: number;
  renderer: RendererKind;
  label: string;
}

export interface BenchResult extends BenchCase {
  /** 実際に盤面へ置けた数 */
  placed: number;
  /** 計測中の最低fps（ここが本番の体感を決める） */
  minFps: number;
  /** 計測中の平均fps */
  avgFps: number;
  /**
   * 深く食い込んでいる接触ペアの割合（0〜1）。記録だけして表には出さない。
   * この計測は「崩れている最中」を測るので、押し合っている値が出るのは正常。
   * 積もり切った状態の潰れ具合とは別物なので、並べて見せると誤解になる。
   */
  crushRatio: number;
}

const WARMUP_FRAMES = 24; // 並べた直後は崩れ始めで不安定なので捨てる
const MEASURE_FRAMES = 120; // 約2秒ぶん均す

/**
 * 玉数 x 描画方式 を順番に回して性能を測る。
 *
 * 設計方針: **待たない**。
 * 上から降らせて積もるのを待つ方式は1条件20〜45秒かかり、8条件で3分を超えた。
 * 待ち時間そのものが計測のやる気を削ぐので、最初から盤面いっぱいに玉を並べて、
 * 崩れ出した直後の一番重い状態だけを測る。1条件あたり約2.4秒。
 */
export class Bench {
  private queue: BenchCase[] = [];
  private active = false;
  private frames = 0;
  private samples: number[] = [];
  private placed = 0;
  readonly results: BenchResult[] = [];
  current: BenchCase | null = null;

  get running(): boolean {
    return this.active;
  }

  get progress(): string {
    const total = this.results.length + this.queue.length + (this.current ? 1 : 0);
    return `${this.results.length + 1}/${total}`;
  }

  start(cases: BenchCase[]): BenchCase | null {
    this.queue = [...cases];
    this.results.length = 0;
    this.active = true;
    return this.advance();
  }

  cancel(): void {
    this.queue = [];
    this.current = null;
    this.active = false;
  }

  /** 次の条件へ。戻り値が null なら全部終わり */
  private advance(): BenchCase | null {
    const next = this.queue.shift() ?? null;
    this.current = next;
    this.active = next !== null;
    this.frames = 0;
    this.samples.length = 0;
    return next;
  }

  /** 条件を切り替えた直後に、実際に置けた数を伝える */
  notifyPlaced(placed: number): void {
    this.placed = placed;
    this.frames = 0;
    this.samples.length = 0;
  }

  /**
   * 毎フレーム呼ぶ。次の条件に移る時だけ BenchCase を返す。
   * finished が true になったら全部完了。
   */
  tick(fps: number, scene: PerfScene): { next: BenchCase | null; finished: boolean } {
    if (!this.active || !this.current) return { next: null, finished: false };

    this.frames++;
    if (this.frames <= WARMUP_FRAMES) return { next: null, finished: false };
    if (Number.isFinite(fps) && fps > 0) this.samples.push(fps);
    if (this.samples.length < MEASURE_FRAMES) return { next: null, finished: false };

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    let min = Infinity;
    for (const v of this.samples) if (v < min) min = v;

    this.results.push({
      ...this.current,
      placed: this.placed,
      minFps: min,
      avgFps: avg,
      crushRatio: scene.crushRatio,
    });

    const next = this.advance();
    return { next, finished: next === null };
  }

  /** 結果を表のHTMLにする（れいあがスクショを撮って渡せる形） */
  toTableHtml(): string {
    const rows = this.results
      .map((r) => {
        const cls = r.minFps >= 50 ? 'ok' : r.minFps >= 30 ? 'mid' : 'bad';
        return `<tr>
          <td>${r.renderer === 'pixi' ? 'Pixi' : 'Canvas'}</td>
          <td>${r.placed}</td>
          <td class="${cls}">${r.minFps.toFixed(0)}</td>
          <td>${r.avgFps.toFixed(0)}</td>
        </tr>`;
      })
      .join('');
    return `<table>
      <thead><tr><th>描画</th><th>玉の数</th><th>最低fps</th><th>平均</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
}
