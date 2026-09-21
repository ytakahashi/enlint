import {
  BUILT_IN_CONTEXT_PROFILES,
  type Evaluator,
  type IssueCategory,
  lintMessage,
  type MetricId,
} from "#core/mod.ts";
import type { GoldenCorpus, GoldenSeverity } from "./corpus.ts";
import type { GoldenObservation, GoldenVariantName } from "./analysis.ts";

const CATEGORY_BY_METRIC = {
  naturalness: "wording",
  grammar: "grammar",
  clarity: "clarity",
  contextFit: "context",
} as const satisfies Readonly<Record<MetricId, IssueCategory>>;

export async function evaluateGoldenCorpus(
  corpus: GoldenCorpus,
  evaluator: Evaluator,
  options: {
    readonly repeats: number;
    readonly concurrency: number;
    /** Minimum interval between request starts across all workers. */
    readonly startIntervalMs?: number;
    readonly existingObservations?: readonly GoldenObservation[];
    readonly onProgress?: (completed: number, total: number) => void;
    readonly onObservation?: (
      observation: GoldenObservation,
      completed: number,
      total: number,
    ) => void | Promise<void>;
  },
): Promise<readonly GoldenObservation[]> {
  requirePositiveInteger(options.repeats, "repeats");
  requirePositiveInteger(options.concurrency, "concurrency");
  const startIntervalMs = options.startIntervalMs ?? 0;
  if (!Number.isInteger(startIntervalMs) || startIntervalMs < 0) {
    throw new RangeError("startIntervalMs must be a non-negative integer");
  }

  const allJobs = corpus.pairs.flatMap((pair) =>
    (["better", "worse"] as const).flatMap((variant) =>
      Array.from({ length: options.repeats }, (_, run) => ({
        pair,
        variant,
        run,
      }))
    )
  );
  const requiredKeys = new Set(allJobs.map(jobKey));
  const observations = (options.existingObservations ?? []).filter(
    (observation) => requiredKeys.has(observationKey(observation)),
  );
  const completedKeys = new Set<string>();
  for (const observation of observations) {
    const key = observationKey(observation);
    if (completedKeys.has(key)) {
      throw new TypeError(`duplicate existing golden observation "${key}"`);
    }
    completedKeys.add(key);
  }
  const jobs = allJobs.filter((job) => !completedKeys.has(jobKey(job)));
  let nextJob = 0;
  let nextStartAt = 0;
  let schedule = Promise.resolve();
  let failure: unknown;

  if (observations.length > 0) {
    options.onProgress?.(observations.length, allJobs.length);
  }

  const waitForStart = (): Promise<void> => {
    const turn = schedule.then(async () => {
      const waitMs = Math.max(0, nextStartAt - Date.now());
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      nextStartAt = Date.now() + startIntervalMs;
    });
    schedule = turn.catch(() => {});
    return turn;
  };

  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency, jobs.length) },
      async () => {
        while (failure === undefined && nextJob < jobs.length) {
          const job = jobs[nextJob++];
          try {
            await waitForStart();
            const profile = BUILT_IN_CONTEXT_PROFILES[job.pair.context];
            const result = await lintMessage(
              { text: job.pair[job.variant].text, profile },
              evaluator,
            );
            const observation = toObservation(
              job.pair.id,
              job.pair.focus,
              job.variant,
              job.run,
              result,
            );
            observations.push(observation);
            await options.onObservation?.(
              observation,
              observations.length,
              allJobs.length,
            );
            options.onProgress?.(observations.length, allJobs.length);
          } catch (error) {
            failure ??= error;
          }
        }
      },
    ),
  );

  if (failure !== undefined) {
    throw failure;
  }

  return observations.toSorted((left, right) =>
    left.pairId.localeCompare(right.pairId) ||
    left.variant.localeCompare(right.variant) || left.run - right.run
  );
}

function jobKey(job: {
  readonly pair: { readonly id: string };
  readonly variant: GoldenVariantName;
  readonly run: number;
}): string {
  return `${job.pair.id}:${job.variant}:${job.run}`;
}

function observationKey(observation: GoldenObservation): string {
  return `${observation.pairId}:${observation.variant}:${observation.run}`;
}

function toObservation(
  pairId: string,
  focus: MetricId,
  variant: GoldenVariantName,
  run: number,
  result: Awaited<ReturnType<typeof lintMessage>>,
): GoldenObservation {
  const metrics = Object.fromEntries(
    result.metrics.map(({ id, score }) => [id, score]),
  ) as Record<MetricId, number>;
  const metricConfidences = Object.fromEntries(
    result.metrics.flatMap(({ id, confidence }) =>
      confidence === undefined ? [] : [[id, confidence]]
    ),
  );
  const tone = result.classifications.find(({ id }) => id === "tone");
  const needsFix = result.judgements.find(({ id }) => id === "needsFix");
  if (tone === undefined) {
    throw new TypeError('missing result for classification "tone"');
  }
  if (needsFix === undefined) {
    throw new TypeError('missing result for judgement "needsFix"');
  }

  const focusIssue = result.issues.find(({ category }) =>
    category === CATEGORY_BY_METRIC[focus]
  );
  const focusSeverity: GoldenSeverity = focusIssue?.severity ?? "none";
  const severityRank = { none: 0, low: 1, medium: 2, high: 3 } as const;
  const highestIssueSeverity = result.issues.reduce<GoldenSeverity>(
    (highest, issue) =>
      severityRank[issue.severity] > severityRank[highest]
        ? issue.severity
        : highest,
    "none",
  );

  return {
    pairId,
    variant,
    run,
    overallScore: result.overallScore,
    metricScores: metrics,
    metricConfidences,
    tone: tone.value,
    toneConfidence: tone.confidence,
    needsFixProbability: needsFix.probability,
    status: result.status,
    focusSeverity,
    highestIssueSeverity,
  };
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}
