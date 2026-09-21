import { assertEquals } from "@std/assert";
import { CLASSIFICATION_DEFINITIONS } from "#core/domain/classification.ts";
import { BUILT_IN_CONTEXT_PROFILES } from "#core/domain/context_profile.ts";
import type { EvaluationRequest } from "#core/domain/evaluator.ts";
import { JUDGEMENT_DEFINITIONS } from "#core/domain/judgement.ts";
import { METRIC_DEFINITIONS } from "#core/domain/metric.ts";
import type { JevEvaluationResponse } from "#infra/jev/_types.ts";
import { mapJevResponse } from "#infra/jev/answer_mapper.ts";
import { runJevEvaluation } from "#infra/jev/jev_evaluator.ts";
import { buildJevInput } from "#infra/jev/question_builder.ts";

const REQUEST: EvaluationRequest = {
  text: "Could you review this today?",
  profile: BUILT_IN_CONTEXT_PROFILES.work,
  metrics: METRIC_DEFINITIONS,
  classifications: CLASSIFICATION_DEFINITIONS,
  judgements: JUDGEMENT_DEFINITIONS,
};
const USAGE_FIELDS = ["inputTokens", "outputTokens", "totalTokens"] as const;

Deno.test(
  "live Jev response matches the recorded fixture contract",
  async () => {
    requireGatewayCredential();

    const input = buildJevInput(REQUEST);
    const response = await runJevEvaluation({
      model: "typesafe-ai/jev",
      state: input.state,
      questions: input.questions,
      maxRetries: 2,
      timeoutMs: 30_000,
    });
    const fixture = await readCompleteFixture();

    await printCapturedContract(response);

    // This exercises the same untrusted-response boundary as production before
    // comparing optional fields whose presence is defined by the provider.
    mapJevResponse(REQUEST, response);
    assertEquals(
      answerEvidenceContract(response.answers),
      answerEvidenceContract(fixture.answers),
    );
    assertEquals(response.rounding, fixture.rounding);
    assertEquals(
      usageFieldContract(response.usage),
      usageFieldContract(fixture.usage),
    );
    assertEquals(
      confidenceQuestionIds(response.providerMetadata),
      confidenceQuestionIds(fixture.providerMetadata),
      "live provider confidence metadata differs from the fixture contract",
    );
  },
);

function answerEvidenceContract(
  answers: JevEvaluationResponse["answers"],
): Readonly<Record<string, { type: string; hasProbabilities: boolean }>> {
  return Object.fromEntries(
    Object.entries(answers).map(([id, answer]) => [
      id,
      {
        type: answer.type,
        hasProbabilities: "probabilities" in answer &&
          answer.probabilities !== undefined,
      },
    ]),
  );
}

function usageFieldContract(
  usage: JevEvaluationResponse["usage"],
): readonly string[] | undefined {
  if (usage === undefined) {
    return undefined;
  }
  return USAGE_FIELDS.filter((key) => usage[key] !== undefined);
}

function requireGatewayCredential(): void {
  if (!Deno.env.get("AI_GATEWAY_API_KEY")) {
    throw new Error("set AI_GATEWAY_API_KEY before running live tests");
  }
}

async function readCompleteFixture(): Promise<JevEvaluationResponse> {
  const text = await Deno.readTextFile(
    new URL("../infra/jev/_fixtures/complete_response.json", import.meta.url),
  );
  return JSON.parse(text) as JevEvaluationResponse;
}

function confidenceQuestionIds(
  providerMetadata: Readonly<Record<string, unknown>> | undefined,
): readonly string[] | undefined {
  const typesafe = providerMetadata?.typesafe;
  if (!isRecord(typesafe) || !isRecord(typesafe.confidence)) {
    return undefined;
  }
  return Object.keys(typesafe.confidence).sort();
}

async function printCapturedContract(
  response: JevEvaluationResponse,
): Promise<void> {
  const captured = {
    answers: response.answers,
    rounding: response.rounding,
    usage: response.usage,
    providerMetadata: response.providerMetadata,
  };
  const output = `\n${JSON.stringify(captured, null, 2)}\n`;
  await Deno.stdout.write(new TextEncoder().encode(output));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
