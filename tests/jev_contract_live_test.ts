import { assertEquals } from "@std/assert";
import { CLASSIFICATION_DEFINITIONS } from "#core/domain/classification.ts";
import { BUILT_IN_CONTEXT_PROFILES } from "#core/domain/context_profile.ts";
import type { EvaluationRequest } from "#core/domain/evaluator.ts";
import { JUDGEMENT_DEFINITIONS } from "#core/domain/judgement.ts";
import { METRIC_DEFINITIONS } from "#core/domain/metric.ts";
// The live contract must compare real responses and the recorded fixture using
// the adapter's private wire shape, so this file is an explicit exception to
// the `_` prefix rule.
import type { JevEvaluationResponse } from "#infra/jev/_types.ts";
import { mapJevResponse } from "#infra/jev/answer_mapper.ts";
import {
  JEV_MODEL_ID,
  listJevModels,
  runJevEvaluation,
} from "#infra/jev/jev_evaluator.ts";
import { buildJevInput } from "#infra/jev/question_builder.ts";

const REQUEST: EvaluationRequest = {
  text: "Could you review this today?",
  profile: BUILT_IN_CONTEXT_PROFILES.work,
  metrics: METRIC_DEFINITIONS,
  classifications: CLASSIFICATION_DEFINITIONS,
  judgements: JUDGEMENT_DEFINITIONS,
};
const TIMEOUT_MS = 30_000;

Deno.test("live Jev response matches the recorded fixture contract", async () => {
  const apiKey = requireTypeSafeCredential();
  const input = buildJevInput(REQUEST);
  const response = await runJevEvaluation({
    apiKey,
    model: JEV_MODEL_ID,
    state: input.state,
    questions: input.questions,
    maxRetries: 2,
    timeoutMs: TIMEOUT_MS,
  });
  const fixture = await readCompleteFixture();
  const models = await listJevModels(apiKey, TIMEOUT_MS);

  await printCapturedContract(response, models);

  // The SDK does not validate answer contents, so production mapping remains
  // the untrusted-response boundary exercised by this contract test.
  mapJevResponse(REQUEST, response);
  assertTwoDecimalRounding(response.answers);
  assertEquals(
    answerEvidenceContract(response.answers),
    answerEvidenceContract(fixture.answers),
  );
  assertEquals(Object.keys(response.usage).sort(), [
    "input_tokens",
    "output_tokens",
  ]);
});

function answerEvidenceContract(
  answers: JevEvaluationResponse["answers"],
): Readonly<
  Record<
    string,
    { type: string; hasConfidence: boolean; hasProbabilities: boolean }
  >
> {
  return Object.fromEntries(
    Object.entries(answers).map(([id, answer]) => [
      id,
      {
        type: answer.type,
        hasConfidence: "confidence" in answer,
        hasProbabilities: "probabilities" in answer,
      },
    ]),
  );
}

function assertTwoDecimalRounding(
  answers: JevEvaluationResponse["answers"],
): void {
  const roundedValues = Object.values(answers).flatMap((answer) => {
    if (answer.type === "noul") return [];
    const probabilities = Object.values(answer.probabilities);
    return answer.type === "score"
      ? [answer.score, ...probabilities]
      : probabilities;
  });
  assertEquals(
    roundedValues.every((value) => isOnDecimalGrid(value, 2)),
    true,
    "score and probability values must use at most two decimal places",
  );
  assertEquals(
    roundedValues.some((value) => !isOnDecimalGrid(value, 1)),
    true,
    "the response must demonstrate hundredths precision",
  );
}

function isOnDecimalGrid(value: number, decimalPlaces: number): boolean {
  const scale = 10 ** decimalPlaces;
  return Math.abs(value * scale - Math.round(value * scale)) <= 1e-9;
}

function requireTypeSafeCredential(): string {
  const apiKey = Deno.env.get("TYPESAFE_API_KEY") ?? "";
  if (!apiKey.trim()) {
    throw new Error("set TYPESAFE_API_KEY before running live tests");
  }
  return apiKey;
}

async function readCompleteFixture(): Promise<JevEvaluationResponse> {
  // The live contract must compare a real response with the adapter's recorded
  // private fixture, so this access is an explicit exception to the `_` prefix
  // rule.
  const text = await Deno.readTextFile(
    new URL("../infra/jev/_fixtures/complete_response.json", import.meta.url),
  );
  return JSON.parse(text) as JevEvaluationResponse;
}

async function printCapturedContract(
  response: JevEvaluationResponse,
  models: readonly string[],
): Promise<void> {
  const output = `\n${
    JSON.stringify({ ...response, availableModels: models }, null, 2)
  }\n`;
  await Deno.stdout.write(new TextEncoder().encode(output));
}
