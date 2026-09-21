import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import {
  CLASSIFICATION_DEFINITIONS,
  TONE_DEFINITION,
} from "#core/domain/classification.ts";
import { BUILT_IN_CONTEXT_PROFILES } from "#core/domain/context_profile.ts";
import type { EvaluationRequest } from "#core/domain/evaluator.ts";
import { JUDGEMENT_DEFINITIONS } from "#core/domain/judgement.ts";
import { METRIC_DEFINITIONS } from "#core/domain/metric.ts";
import { buildJevInput } from "./question_builder.ts";

function request(): EvaluationRequest {
  return {
    text: "Could you review this today?",
    profile: BUILT_IN_CONTEXT_PROFILES.work,
    metrics: METRIC_DEFINITIONS,
    classifications: CLASSIFICATION_DEFINITIONS,
    judgements: JUDGEMENT_DEFINITIONS,
  };
}

Deno.test("buildJevInput creates the shared state and all question types", () => {
  const input = buildJevInput(request());

  assertEquals(
    input.state,
    `Context: ${BUILT_IN_CONTEXT_PROFILES.work.description}\n\nMessage:\nCould you review this today?`,
  );
  assertEquals(Object.keys(input.questions), [
    "naturalness",
    "grammar",
    "clarity",
    "contextFit",
    "tone",
    "needsFix",
  ]);
  assertEquals(input.questions.naturalness, {
    type: "score",
    instructions: METRIC_DEFINITIONS[0].instructions,
    criteria: METRIC_DEFINITIONS[0].levels,
  });
  assertEquals(input.questions.tone, {
    type: "choice",
    instructions: TONE_DEFINITION.instructions,
    criteria: TONE_DEFINITION.choices,
  });
  assertEquals(input.questions.needsFix, {
    type: "noul",
    instructions: JUDGEMENT_DEFINITIONS[0].instructions,
    criteria: JUDGEMENT_DEFINITIONS[0].criteria,
  });
  assertStrictEquals(
    (input.questions.grammar as { readonly criteria: readonly string[] })
      .criteria,
    METRIC_DEFINITIONS[1].levels,
  );
});

Deno.test("buildJevInput rejects duplicate IDs across definition kinds", () => {
  const duplicated = {
    ...request(),
    classifications: [{
      ...TONE_DEFINITION,
      id: "naturalness",
    }],
  } as unknown as EvaluationRequest;

  assertThrows(
    () => buildJevInput(duplicated),
    TypeError,
    'duplicate evaluation question ID "naturalness"',
  );
});
