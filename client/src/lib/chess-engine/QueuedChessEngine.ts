import {
  type ChessEngine,
  type ChessEngineLine,
  EngineEvaluationPriorities,
  type EngineEvaluationPriority,
  type EvaluationRequest,
  type EvaluationUpdate,
  type FullMoveEvaluation,
} from "../ChessEngine.ts";

interface JobSubscriber {
  onUpdate?: (update: EvaluationUpdate) => void;
  resolve(result: FullMoveEvaluation): void;
  reject(error: unknown): void;
}

interface QueueJob {
  fen: string;
  minDepth: number;
  linesAmount: number;
  priority: EngineEvaluationPriority;
  subscribers: JobSubscriber[];
  lastUpdate: EvaluationUpdate | null;
}

export class QueuedChessEngine implements ChessEngine {
  private readonly delegate: ChessEngine;
  private currentJob: QueueJob | null = null;
  private pendingJobs: QueueJob[] = [];

  constructor(delegate: ChessEngine) {
    this.delegate = delegate;
  }

  evaluate(
    fen: string,
    options: EvaluationRequest,
    priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation> {
    return this.requestEvaluation(fen, options, priority, onUpdate);
  }

  async getEvaluation(fen: string, minDepth: number = 0): Promise<FullMoveEvaluation | null> {
    return this.delegate.getEvaluation(fen, minDepth);
  }

  async getLines(fen: string, minDepth: number = 0, amount: number = 1): Promise<ChessEngineLine[] | null> {
    return this.delegate.getLines(fen, minDepth, amount);
  }

  private requestEvaluation(
    fen: string,
    options: EvaluationRequest,
    priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation> {
    return new Promise<FullMoveEvaluation>((resolve, reject) => {
      const subscriber: JobSubscriber = { onUpdate, resolve, reject };
      const existingJob = this.findJobByFen(fen);

      if (existingJob && canReuseExistingJob(existingJob, options)) {
        existingJob.subscribers.push(subscriber);
        upgradeJobPriority(existingJob, priority);
        if (existingJob.lastUpdate && onUpdate) {
          notifyUpdateSafely(onUpdate, existingJob.lastUpdate);
        }

        if (existingJob !== this.currentJob) {
          this.reorderPendingJobs();
          this.processQueue();
        }
        return;
      }

      this.pendingJobs.push({
        fen,
        minDepth: options.minDepth,
        linesAmount: options.linesAmount,
        priority,
        subscribers: [subscriber],
        lastUpdate: null,
      });
      this.reorderPendingJobs();
      this.processQueue();
    });
  }

  private findJobByFen(fen: string): QueueJob | null {
    if (this.currentJob?.fen === fen) return this.currentJob;
    return (
      this.pendingJobs.find(function matchByFen(job) {
        return job.fen === fen;
      }) ?? null
    );
  }

  private reorderPendingJobs(): void {
    this.pendingJobs.sort(function sortByPriority(left, right) {
      return getPriorityRank(left.priority) - getPriorityRank(right.priority);
    });
  }

  private processQueue(): void {
    if (this.currentJob || this.pendingJobs.length === 0) return;

    const nextJob = this.pendingJobs.shift();
    if (!nextJob) return;

    nextJob.lastUpdate = null;
    this.currentJob = nextJob;

    void this.delegate
      .evaluate(
        nextJob.fen,
        {
          minDepth: nextJob.minDepth,
          linesAmount: nextJob.linesAmount,
        },
        nextJob.priority,
        (update) => {
          const trimmed = update;
          nextJob.lastUpdate = trimmed;
          notifySubscribers(nextJob, trimmed);
        },
      )
      .then((finalResult) => {
        if (!nextJob.lastUpdate?.isFinal) {
          const finalUpdate: EvaluationUpdate = {
            ...finalResult,
            isFinal: true,
          };
          nextJob.lastUpdate = finalUpdate;
          notifySubscribers(nextJob, finalUpdate);
        }

        resolveSubscribers(nextJob, finalResult);
      })
      .catch((error) => {
        rejectSubscribers(nextJob, error);
      })
      .finally(() => {
        if (this.currentJob === nextJob) this.currentJob = null;
        this.processQueue();
      });
  }
}

function notifySubscribers(job: QueueJob, update: EvaluationUpdate): void {
  const trimmedUpdate = update;
  job.subscribers.forEach(function notify(subscriber) {
    if (!subscriber.onUpdate) return;
    notifyUpdateSafely(subscriber.onUpdate, trimmedUpdate);
  });
}

function resolveSubscribers(job: QueueJob, result: FullMoveEvaluation): void {
  const trimmedResult = result;
  job.subscribers.forEach(function resolve(subscriber) {
    subscriber.resolve(trimmedResult);
  });
}

function rejectSubscribers(job: QueueJob, error: unknown): void {
  job.subscribers.forEach(function reject(subscriber) {
    subscriber.reject(error);
  });
}

function notifyUpdateSafely(callback: (update: EvaluationUpdate) => void, update: EvaluationUpdate): void {
  try {
    callback(update);
  } catch (error) {
    console.error("Failed to deliver engine update to subscriber", error);
  }
}

function canReuseExistingJob(job: QueueJob, options: EvaluationRequest): boolean {
  return job.minDepth >= options.minDepth && job.linesAmount >= options.linesAmount;
}

function upgradeJobPriority(job: QueueJob, priority: EngineEvaluationPriority): void {
  if (getPriorityRank(priority) < getPriorityRank(job.priority)) {
    job.priority = priority;
  }
}

function getPriorityRank(priority: EngineEvaluationPriority): number {
  switch (priority) {
    case EngineEvaluationPriorities.IMMEDIATE:
      return 0;
    case EngineEvaluationPriorities.NEXT:
      return 1;
    default:
      return 2;
  }
}
