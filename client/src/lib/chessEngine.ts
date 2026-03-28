export interface ChessEngineLine {
  uci: string;
  pv: string[];
  evaluation: number;
  depth: number;
  multipv: number;
}

export interface ChessEngineSnapshot {
  depth: number;
  evaluation: number;
  lines: ChessEngineLine[];
}

export interface EvaluationCache {
  getEvaluation(fen: string, minDepth?: number): ChessEngineSnapshot | null;
  addEvaluation(fen: string, depth: number, evaluation: number, lines: ChessEngineLine[]): void;
}

export interface ChessEngine {
  evaluate(fen: string, minDepth: number): Promise<number>;
  lines(fen: string, minDepth: number, amount: number): Promise<ChessEngineLine[]>;
  peekEvaluation(fen: string, minDepth: number): number | null;
  peekLines(fen: string, minDepth: number, amount: number): ChessEngineLine[] | null;
}

interface AnalysisTask {
  fen: string;
  minDepth: number;
  amount: number;
  resolve(lines: ChessEngineLine[]): void;
  reject(error: unknown): void;
}

class FinalEvaluationCache implements EvaluationCache {
  private snapshotsByFen = new Map<string, ChessEngineSnapshot[]>();

  getEvaluation(fen: string, minDepth: number = 0): ChessEngineSnapshot | null {
    const snapshots = this.snapshotsByFen.get(fen) ?? [];
    return snapshots.find(function findSnapshot(entry) {
      return entry.depth >= minDepth;
    }) ?? null;
  }

  addEvaluation(fen: string, depth: number, evaluation: number, lines: ChessEngineLine[]): void {
    const nextSnapshot: ChessEngineSnapshot = { depth, evaluation, lines };
    const snapshots = [...(this.snapshotsByFen.get(fen) ?? [])];
    const existingIndex = snapshots.findIndex(function findByDepth(snapshot) {
      return snapshot.depth === depth;
    });

    if (existingIndex >= 0) {
      snapshots[existingIndex] = mergeSnapshots(snapshots[existingIndex], nextSnapshot);
    } else {
      snapshots.push(nextSnapshot);
    }

    snapshots.sort(function sortByDepth(a, b) {
      return a.depth - b.depth;
    });
    this.snapshotsByFen.set(fen, snapshots);
  }
}

class StockfishChessEngine implements ChessEngine {
  private worker: Worker;
  private queue: AnalysisTask[] = [];
  private currentTask: AnalysisTask | null = null;
  private collected = new Map<number, ChessEngineLine>();
  private cache: EvaluationCache;

  constructor() {
    this.cache = new FinalEvaluationCache();
    this.worker = new Worker('/stockfish/stockfish.js');
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
    this.worker.postMessage('uci');
  }

  async evaluate(fen: string, minDepth: number): Promise<number> {
    const cached = this.peekEvaluation(fen, minDepth);
    if (cached !== null) return cached;

    const lines = await this.enqueue(fen, minDepth, 1);
    return lines[0]?.evaluation ?? 0;
  }

  async lines(fen: string, minDepth: number, amount: number): Promise<ChessEngineLine[]> {
    const cached = this.peekLines(fen, minDepth, amount);
    if (cached) return cached;
    return this.enqueue(fen, minDepth, amount);
  }

  peekEvaluation(fen: string, minDepth: number): number | null {
    const snapshot = this.cache.getEvaluation(fen, minDepth);
    return snapshot ? snapshot.evaluation : null;
  }

  peekLines(fen: string, minDepth: number, amount: number): ChessEngineLine[] | null {
    const snapshot = this.cache.getEvaluation(fen, minDepth);
    if (!snapshot || snapshot.lines.length < amount) return null;
    return snapshot ? snapshot.lines.slice(0, amount) : null;
  }

  private enqueue(fen: string, minDepth: number, amount: number): Promise<ChessEngineLine[]> {
    return new Promise<ChessEngineLine[]>((resolve, reject) => {
      this.queue.push({ fen, minDepth, amount, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.currentTask || this.queue.length === 0) return;

    const nextTask = this.queue.shift();
    if (!nextTask) return;

    this.currentTask = nextTask;
    this.collected = new Map<number, ChessEngineLine>();
    this.worker.postMessage(`setoption name MultiPV value ${nextTask.amount}`);
    this.worker.postMessage(`position fen ${nextTask.fen}`);
    this.worker.postMessage(`go depth ${nextTask.minDepth}`);
  }

  private handleMessage(event: MessageEvent<string>): void {
    const line = event.data;
    const task = this.currentTask;
    if (!task) return;

    if (line.includes('info') && (line.includes('score cp') || line.includes('score mate'))) {
      const depthMatch = line.match(/depth (\d+)/);
      const multipvMatch = line.match(/multipv (\d+)/);
      const pvMatch = line.match(/ pv (.+)/);
      const cpMatch = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);

      const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
      const multipv = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;
      const pvUci = pvMatch ? pvMatch[1].trim() : '';

      if (depth <= 0 || !pvUci) return;

      this.collected.set(multipv, {
        uci: pvUci.split(' ')[0],
        pv: pvUci.split(' '),
        evaluation: normalizeScoreForWhite(task.fen, cpMatch?.[1], mateMatch?.[1]),
        depth,
        multipv,
      });
      return;
    }

    if (!line.startsWith('bestmove')) return;

    const result = [...this.collected.values()]
      .filter(function filterByDepth(entry) {
        return entry.depth >= task.minDepth;
      })
      .sort(function sortByMultiPv(a, b) {
        return a.multipv - b.multipv;
      })
      .slice(0, task.amount);

    this.cache.addEvaluation(task.fen, task.minDepth, result[0]?.evaluation ?? 0, result);

    task.resolve(result);
    this.currentTask = null;
    this.processQueue();
  }

  private handleError(error: ErrorEvent): void {
    if (this.currentTask) {
      this.currentTask.reject(error);
      this.currentTask = null;
    }
    while (this.queue.length > 0) {
      const queued = this.queue.shift();
      queued?.reject(error);
    }
  }
}

function mergeSnapshots(current: ChessEngineSnapshot, next: ChessEngineSnapshot): ChessEngineSnapshot {
  const mergedByMultiPv = new Map<number, ChessEngineLine>();

  current.lines.forEach(function addCurrent(line) {
    mergedByMultiPv.set(line.multipv, line);
  });
  next.lines.forEach(function addNext(line) {
    mergedByMultiPv.set(line.multipv, line);
  });

  return {
    depth: Math.max(current.depth, next.depth),
    evaluation: next.evaluation,
    lines: [...mergedByMultiPv.values()].sort(function sortByMultiPv(a, b) {
      return a.multipv - b.multipv;
    }),
  };
}

function normalizeScoreForWhite(fen: string, cpScore?: string, mateScore?: string): number {
  const sideToMove = fen === 'start' ? 'w' : fen.split(' ')[1];
  const perspective = sideToMove === 'b' ? -1 : 1;

  if (cpScore) return parseInt(cpScore, 10) * perspective / 100;
  if (mateScore) return parseInt(mateScore, 10) * perspective * 1000;
  return 0;
}

let singleton: ChessEngine | null = null;

export function getChessEngine(): ChessEngine {
  if (!singleton) singleton = new StockfishChessEngine();
  return singleton;
}
