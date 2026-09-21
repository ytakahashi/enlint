import {
  type EvaluationUsage,
  JUDGEMENT_DEFINITIONS,
  METRIC_DEFINITIONS,
  TONE_DEFINITION,
} from "#core/mod.ts";
import type { LintReport } from "./report.ts";

export function formatJson(report: LintReport): string {
  const result = report.lintResult;
  const metrics = METRIC_DEFINITIONS.map((definition) => {
    const metric = result.metrics.find(({ id }) => id === definition.id);
    if (metric === undefined) {
      throw new TypeError(`missing result for metric "${definition.id}"`);
    }
    const probabilityKeys = Array.from(
      { length: metric.levelCount },
      (_, index) => String(index),
    );
    return {
      id: metric.id,
      score: metric.score,
      rawLevel: metric.rawLevel,
      levelCount: metric.levelCount,
      confidence: metric.confidence ?? null,
      probabilities: orderedProbabilities(
        metric.probabilities,
        probabilityKeys,
        metric.id,
      ),
    };
  });
  const tone = result.classifications.find(({ id }) => id === "tone");
  if (tone === undefined) {
    throw new TypeError('missing result for classification "tone"');
  }

  const judgements = JUDGEMENT_DEFINITIONS.map((definition) => {
    const judgement = result.judgements.find(({ id }) => id === definition.id);
    if (judgement === undefined) {
      throw new TypeError(`missing result for judgement "${definition.id}"`);
    }
    return {
      id: judgement.id,
      probability: judgement.probability,
      confidence: judgement.confidence ?? null,
    };
  });

  const output = {
    version: 2,
    text: result.text,
    context: result.contextId,
    overallScore: result.overallScore,
    status: result.status,
    metrics,
    classifications: [{
      id: tone.id,
      value: tone.value,
      confidence: tone.confidence ?? null,
      probabilities: orderedProbabilities(
        tone.probabilities,
        Object.keys(TONE_DEFINITION.choices),
        tone.id,
      ),
    }],
    judgements,
    usage: formatUsage(result.usage),
    issues: result.issues,
    advice: report.advice?.outcome ?? null,
  };

  return `${JSON.stringify(output, null, 2)}\n`;
}

function orderedProbabilities(
  probabilities: Readonly<Record<string, number>> | undefined,
  keys: readonly string[],
  id: string,
): Record<string, number> | null {
  if (probabilities === undefined) {
    return null;
  }

  const ordered: Record<string, number> = {};
  for (const key of keys) {
    const probability = probabilities[key];
    if (probability === undefined) {
      throw new TypeError(`missing probability "${key}" for "${id}"`);
    }
    ordered[key] = probability;
  }
  return ordered;
}

function formatUsage(usage: EvaluationUsage | undefined) {
  if (usage === undefined) {
    return null;
  }
  return {
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
  };
}
