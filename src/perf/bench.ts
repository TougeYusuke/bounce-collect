import type { PerfScene } from './perfScene';

export type RendererKind = 'canvas' | 'pixi';

export interface BenchCase {
  count: number;
  renderer: RendererKind;
}

export interface BenchResult extends BenchCase {
  /** 落ちている最中の最悪fps（本番で効くのはこっち） */
  worstFps: number;
  /** 積もり切った後の平均fps */
  settledFps: number;
  /** 積もり切った時点で動いていた玉の数 */
  awake: number;
  /** 深く食い込んでいる接触ペアの割合（0〜1）。高いほど山が潰れている */
  crushRatio: number;
  /** 時間内に落ち着いたか。false なら「積もり切らなかった」 */
  settled: boolean;
}

const SETTLE_TIMEOUT_FRAMES = 2700; // 45秒ぶん。これを超えたら諦めて記録する
/**
 * 「動いている玉がこれ以上減らない」と判断するまでの猶予。
 * ⚠️ 静止の判定に固定のしきい値（例: 3%以下）を使ってはいけない。
 * 傾斜の上では数%の玉が滑り続けるので、しきい値方式だと永久に到達しない（実測）。
 */
const STAGNANT_FRAMES = 300;
const WARMUP_FRAMES = 40; // 計測開始直後は不安定なので捨てる
const MEASURE_FRAMES = 120; // 安定後にfpsを均す長さ

/**
 * 玉数 x 描画方式 を順番に回して性能を測る。
 *
 * ⚠️ 見るべきは「積もり切った後」ではなく「落ちている最中の最悪fps」。
 * 積もった玉は眠って計算対象から外れるので、静止後は本番より軽く出る。
 */
export class Bench {
  private queue: BenchCase[] = [];
  private phase: 'idle' | 'settling' | 'measuring' = 'idle';
  private frames = 0;
  private worst = Infinity;
  private bestAwake = Infinity;
  private stagnant = 0;
  private samples: number[] = [];
  readonly results: BenchResult[] = [];
  current: BenchCase | null = null;

  get running(): boolean {
    return this.phase !== 'idle';
  }

  get progress(): string {
    const total = this.results.length + this.queue.length + (this.current ? 1 : 0);
    return `${this.results.length + 1}/${total}`;
  }

  start(cases: BenchCase[]): BenchCase | null {
    this.queue = [...cases];
    this.results.length = 0;
    return this.advance();
  }

  cancel(): void {
    this.queue = [];
    this.current = null;
    this.phase = 'idle';
  }

  /** 次の条件へ。戻り値が null なら全部終わり */
  private advance(): BenchCase | null {
    const next = this.queue.shift() ?? null;
    this.current = next;
    this.phase = next ? 'settling' : 'idle';
    this.frames = 0;
    this.worst = Infinity;
    this.bestAwake = Infinity;
    this.stagnant = 0;
    this.samples.length = 0;
    return next;
  }

  /**
   * 毎フレーム呼ぶ。次の条件に移る時だけ BenchCase を返す（null なら継続 or 終了）。
   * finished が true になったら全部完了。
   */
  tick(fps: number, scene: PerfScene): { next: BenchCase | null; finished: boolean } {
    if (this.phase === 'idle' || !this.current) return { next: null, finished: false };

    this.frames++;
    if (this.frames < WARMUP_FRAMES) return { next: null, finished: false };

    if (this.phase === 'settling') {
      if (Number.isFinite(fps) && fps > 0) this.worst = Math.min(this.worst, fps);

      const awake = scene.pool.activeCount - scene.sleepingCount;
      const allSpawned = scene.spawnedCount >= scene.target;
      if (awake < this.bestAwake) {
        this.bestAwake = awake;
        this.stagnant = 0;
      } else {
        this.stagnant++;
      }
      const calm = awake <= 5 || this.stagnant > STAGNANT_FRAMES;

      if ((allSpawned && calm) || this.frames > SETTLE_TIMEOUT_FRAMES) {
        this.phase = 'measuring';
        this.samples.length = 0;
      }
      return { next: null, finished: false };
    }

    // measuring
    if (Number.isFinite(fps) && fps > 0) this.samples.push(fps);
    if (this.samples.length < MEASURE_FRAMES) return { next: null, finished: false };

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.results.push({
      ...this.current,
      worstFps: this.worst === Infinity ? avg : this.worst,
      settledFps: avg,
      awake: scene.pool.activeCount - scene.sleepingCount,
      crushRatio: scene.crushRatio,
      settled: this.frames <= SETTLE_TIMEOUT_FRAMES,
    });

    const next = this.advance();
    return { next, finished: next === null };
  }

  /** 結果を表のHTMLにする（れいあがスクショを撮って渡せる形） */
  toTableHtml(): string {
    const rows = this.results
      .map((r) => {
        const pct = Math.round(r.crushRatio * 100);
        const cls = r.worstFps >= 50 ? 'ok' : r.worstFps >= 30 ? 'mid' : 'bad';
        const notes: string[] = [];
        if (!r.settled) notes.push('積もり切らず');
        if (pct >= 8) notes.push(`潰れ${pct}%`);
        const note = notes.join(' / ');
        return `<tr>
          <td>${r.count}</td>
          <td>${r.renderer === 'pixi' ? 'Pixi' : 'Canvas'}</td>
          <td class="${cls}">${r.worstFps.toFixed(0)}</td>
          <td>${r.settledFps.toFixed(0)}</td>
          <td class="${note ? 'bad' : ''}">${note || 'OK'}</td>
        </tr>`;
      })
      .join('');
    return `<table>
      <thead><tr><th>玉</th><th>描画</th><th>最悪fps</th><th>静止後</th><th>備考</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
}
