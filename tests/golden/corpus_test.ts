import { assertEquals } from "@std/assert";
import { JevEvaluator } from "#infra/jev/jev_evaluator.ts";
import { analyzeGoldenCorpus } from "../../tools/golden/analysis.ts";
import { loadGoldenCorpus } from "../../tools/golden/corpus.ts";
import { evaluateGoldenCorpus } from "../../tools/golden/evaluate.ts";

const DEFAULT_REPEATS = 3;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_START_INTERVAL_MS = 2_100;

Deno.test("better golden messages outrank worse messages", async () => {
  requireGatewayCredential();
  const completeCorpus = await loadGoldenCorpus();
  const corpus = {
    ...completeCorpus,
    pairs: completeCorpus.pairs.filter(({ split }) => split === "validation"),
  };
  const observations = await evaluateGoldenCorpus(
    corpus,
    new JevEvaluator({
      timeoutMs: readPositiveIntegerEnv(
        "ENLINT_GOLDEN_TIMEOUT_MS",
        DEFAULT_TIMEOUT_MS,
      ),
    }),
    {
      repeats: readPositiveIntegerEnv(
        "ENLINT_GOLDEN_REPEATS",
        DEFAULT_REPEATS,
      ),
      concurrency: readPositiveIntegerEnv(
        "ENLINT_GOLDEN_CONCURRENCY",
        DEFAULT_CONCURRENCY,
      ),
      startIntervalMs: readNonNegativeIntegerEnv(
        "ENLINT_GOLDEN_INTERVAL_MS",
        DEFAULT_START_INTERVAL_MS,
      ),
    },
  );
  const analysis = analyzeGoldenCorpus(corpus, observations);
  const failures = analysis.pairs.flatMap((result) => {
    const reasons = [];
    if (result.overallMargin <= 0) {
      reasons.push(`overall margin ${result.overallMargin.toFixed(1)}`);
    }
    if (result.focusMargin <= 0) {
      reasons.push(
        `${result.pair.focus} margin ${result.focusMargin.toFixed(1)}`,
      );
    }
    return reasons.length === 0
      ? []
      : [`${result.pair.id}: ${reasons.join(", ")}`];
  });

  assertEquals(
    failures,
    [],
    "every validation pair must improve both its focus metric and overall score",
  );
});

function requireGatewayCredential(): void {
  if (!(Deno.env.get("AI_GATEWAY_API_KEY") ?? "").trim()) {
    throw new Error("set AI_GATEWAY_API_KEY before running golden tests");
  }
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
