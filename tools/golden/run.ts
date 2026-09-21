import {
  BUILT_IN_CONTEXT_PROFILES,
  CLASSIFICATION_DEFINITIONS,
  JUDGEMENT_DEFINITIONS,
  lintMessage,
  METRIC_DEFINITIONS,
  type MetricId,
} from "#core/mod.ts";
import {
  JEV_MODEL_ID,
  JevEvaluator,
  JevRequestTimeoutError,
  runJevEvaluation,
} from "#infra/jev/jev_evaluator.ts";
import { analyzeGoldenCorpus, confidenceDistributions } from "./analysis.ts";
import {
  clearGoldenCheckpoint,
  fingerprintGoldenRun,
  loadGoldenCheckpoint,
  saveGoldenCheckpoint,
} from "./checkpoint.ts";
import {
  evaluateIssueThresholds,
  evaluateStatusThresholds,
  evaluateWeights,
  findBestIssueThresholds,
  findBestStatusThresholds,
  findBestWeights,
  type MetricWeights,
} from "./tuning.ts";
import { loadGoldenCorpus } from "./corpus.ts";
import { evaluateGoldenCorpus } from "./evaluate.ts";
import { guardJevModel, JevModelChangedError } from "./model_guard.ts";

const DEFAULT_REPEATS = 3;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 120_000;
// Avoid the request burst seen in long corpus runs. Accounts with measured
// higher quotas can explicitly lower this interval.
const DEFAULT_START_INTERVAL_MS = 2_100;

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(
      `golden corpus evaluation failed: ${errorMessage(error)}`,
    );
    Deno.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const apiKey = requireTypeSafeCredential();
  const corpus = await loadGoldenCorpus();
  const repeats = readPositiveIntegerEnv(
    "ENLINT_GOLDEN_REPEATS",
    DEFAULT_REPEATS,
  );
  const concurrency = readPositiveIntegerEnv(
    "ENLINT_GOLDEN_CONCURRENCY",
    DEFAULT_CONCURRENCY,
  );
  const timeoutMs = readPositiveIntegerEnv(
    "ENLINT_GOLDEN_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
  );
  const startIntervalMs = readNonNegativeIntegerEnv(
    "ENLINT_GOLDEN_INTERVAL_MS",
    DEFAULT_START_INTERVAL_MS,
  );
  const resolvedModel = await probeResolvedModel(apiKey, timeoutMs, corpus);
  const fingerprint = await fingerprintGoldenRun({
    version: 2,
    model: {
      requested: JEV_MODEL_ID,
      resolved: resolvedModel,
    },
    repeats,
    corpus,
    metricDefinitions: METRIC_DEFINITIONS,
    classificationDefinitions: CLASSIFICATION_DEFINITIONS,
    judgementDefinitions: JUDGEMENT_DEFINITIONS,
    contextProfiles: BUILT_IN_CONTEXT_PROFILES,
  });
  const savedObservations = [
    ...await loadGoldenCheckpoint(fingerprint),
  ];
  if (savedObservations.length > 0) {
    console.error(
      `Resuming from ${savedObservations.length}/${
        corpus.pairs.length * 2 * repeats
      } saved messages`,
    );
  }
  let checkpointWrite = Promise.resolve();
  const observations = await evaluateGoldenCorpus(
    corpus,
    new JevEvaluator({
      apiKey,
      timeoutMs,
      runEvaluation: guardJevModel(runJevEvaluation, resolvedModel),
    }),
    {
      repeats,
      concurrency,
      startIntervalMs,
      existingObservations: savedObservations,
      onObservation: (observation) => {
        savedObservations.push(observation);
        checkpointWrite = checkpointWrite.then(() =>
          saveGoldenCheckpoint(fingerprint, savedObservations)
        );
        return checkpointWrite;
      },
      onProgress: (completed, total) => {
        const reportEvery = repeats * 2;
        if (completed % reportEvery === 0 || completed === total) {
          console.error(`Evaluated ${completed}/${total} golden messages`);
        }
      },
    },
  );
  await clearGoldenCheckpoint();

  const all = analyzeGoldenCorpus(corpus, observations);
  const calibration = analyzeGoldenCorpus(
    corpus,
    observations,
    "calibration",
  );
  const validation = analyzeGoldenCorpus(corpus, observations, "validation");
  const suggestedWeights = findBestWeights(corpus, observations);
  const currentWeights = Object.fromEntries(
    METRIC_DEFINITIONS.map(({ id, weight }) => [id, weight]),
  ) as Record<MetricId, number>;
  const currentValidation = evaluateWeights(
    corpus,
    observations,
    currentWeights,
    "validation",
  );
  const suggestedValidation = evaluateWeights(
    corpus,
    observations,
    suggestedWeights.weights,
    "validation",
  );

  console.log(
    `Jev model: requested=${JEV_MODEL_ID}, resolved=${resolvedModel}`,
  );
  console.log(`Golden corpus: ${corpus.pairs.length} pairs x ${repeats} runs`);
  console.log(qualityLine("all", all));
  console.log(qualityLine("calibration", calibration));
  console.log(qualityLine("validation", validation));
  console.log("");
  for (const result of all.pairs) {
    const passed = result.overallMargin > 0 && result.focusMargin > 0;
    console.log(
      `${passed ? "PASS" : "FAIL"} ${result.pair.id}: ` +
        `overall ${signed(result.overallMargin)}, ` +
        `${result.pair.focus} ${signed(result.focusMargin)}`,
    );
  }

  console.log("");
  console.log(
    `Current validation weights: ${formatWeights(currentWeights)}; ` +
      `${currentValidation.correctPairs}/${validation.pairs.length} ordered, ` +
      `mean margin ${currentValidation.meanMargin.toFixed(2)}`,
  );
  console.log(
    `Suggested calibration weights: ${
      formatWeights(suggestedWeights.weights)
    }; ` +
      `${suggestedValidation.correctPairs}/${validation.pairs.length} validation pairs ordered, ` +
      `mean margin ${suggestedValidation.meanMargin.toFixed(2)}`,
  );

  const status = findBestStatusThresholds(corpus, observations);
  const issue = findBestIssueThresholds(corpus, observations);
  const validationStatus = evaluateStatusThresholds(
    corpus,
    observations,
    status,
    "validation",
  );
  const validationIssue = evaluateIssueThresholds(
    corpus,
    observations,
    issue,
    "validation",
  );
  console.log(
    `Suggested status thresholds: ready=${status.readyScore}, ` +
      `needsFix=${status.needsFixProbability.toFixed(2)} ` +
      `(${status.errors} calibration errors, ` +
      `${validationStatus.errors} validation errors)`,
  );
  console.log(
    `Suggested issue thresholds: ready=${issue.readyScore}, ` +
      `medium=${issue.mediumScore}, high=${issue.highScore} ` +
      `(${issue.errors} calibration errors, ` +
      `${validationIssue.errors} validation errors)`,
  );

  const confidence = confidenceDistributions(observations);
  console.log(`Metric confidence: ${formatDistribution(confidence.metrics)}`);
  console.log(`Tone confidence: ${formatDistribution(confidence.tone)}`);
}

async function probeResolvedModel(
  apiKey: string,
  timeoutMs: number,
  corpus: Awaited<ReturnType<typeof loadGoldenCorpus>>,
): Promise<string> {
  const pair = corpus.pairs[0];
  if (pair === undefined) {
    throw new TypeError("golden corpus must contain at least one pair");
  }

  // Probe through the use case the run itself uses. Building a second request
  // here would resolve the alias for questions the corpus never sends once a
  // context profile overrides the metric definitions.
  let resolved: string | undefined;
  const evaluator = new JevEvaluator({
    apiKey,
    timeoutMs,
    runEvaluation: async (options) => {
      const response = await runJevEvaluation(options);
      resolved = response.model;
      return response;
    },
  });
  await lintMessage(
    {
      text: pair.better.text,
      profile: BUILT_IN_CONTEXT_PROFILES[pair.context],
    },
    evaluator,
  );

  // The fingerprint and the run guard both key on this value, so an unobserved
  // probe must fail loudly rather than pass an empty model along.
  if (resolved === undefined) {
    throw new TypeError("the Jev probe did not observe a response");
  }
  return resolved;
}

function qualityLine(
  label: string,
  analysis: ReturnType<typeof analyzeGoldenCorpus>,
): string {
  return `${label}: overall=${percent(analysis.overallOrderingRate)}, ` +
    `focus=${percent(analysis.focusOrderingRate)}, ` +
    `sendability=${percent(analysis.sendabilityAccuracy)}, ` +
    `severity=${percent(analysis.severityAccuracy)}, ` +
    `tone=${percent(analysis.toneAccuracy)}, ` +
    `status/issue tension=${percent(analysis.statusIssueTensionRate)}`;
}

function formatWeights(weights: MetricWeights): string {
  return METRIC_DEFINITIONS.map(({ id }) => `${id}=${weights[id].toFixed(2)}`)
    .join(", ");
}

function formatDistribution(
  summary: ReturnType<typeof confidenceDistributions>["metrics"],
): string {
  if (summary === undefined) {
    return "unavailable";
  }
  return `n=${summary.count}, min=${summary.minimum.toFixed(2)}, ` +
    `p10=${summary.p10.toFixed(2)}, median=${summary.median.toFixed(2)}, ` +
    `p90=${summary.p90.toFixed(2)}, max=${summary.maximum.toFixed(2)}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function requireTypeSafeCredential(): string {
  const apiKey = Deno.env.get("TYPESAFE_API_KEY") ?? "";
  if (!apiKey.trim()) {
    throw new Error("set TYPESAFE_API_KEY before running the golden corpus");
  }
  return apiKey;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const text = Deno.env.get(name);
  if (text === undefined) {
    return fallback;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function readNonNegativeIntegerEnv(name: string, fallback: number): number {
  const text = Deno.env.get(name);
  if (text === undefined) {
    return fallback;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof JevRequestTimeoutError) {
    return `${error.message}. Increase ENLINT_GOLDEN_TIMEOUT_MS or reduce ` +
      "ENLINT_GOLDEN_CONCURRENCY; the next run will resume from its checkpoint.";
  }
  if (error instanceof JevModelChangedError) {
    return `${error.message}. The checkpoint belongs to the previous model, ` +
      "so the next run re-resolves the alias and starts the corpus over.";
  }
  return error instanceof Error ? error.message : String(error);
}
