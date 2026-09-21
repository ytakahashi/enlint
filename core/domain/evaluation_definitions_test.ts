import { assert, assertEquals } from "@std/assert";
import {
  CLASSIFICATION_DEFINITIONS,
  TONE_DEFINITION,
} from "./classification.ts";
import { JUDGEMENT_DEFINITIONS, NEEDS_FIX_DEFINITION } from "./judgement.ts";
import { METRIC_DEFINITIONS } from "./metric.ts";

Deno.test("metric definitions form a complete weighted rubric", () => {
  assertEquals(
    METRIC_DEFINITIONS.map(({ id }) => id),
    ["naturalness", "grammar", "clarity", "contextFit"],
  );
  // Weights are tuned against the golden corpus, so compare with a tolerance.
  // Exact equality fails for reasonable splits such as 0.35/0.3/0.2/0.15.
  const totalWeight = METRIC_DEFINITIONS.reduce(
    (sum, { weight }) => sum + weight,
    0,
  );
  assert(Math.abs(totalWeight - 1) < 1e-9);

  for (const definition of METRIC_DEFINITIONS) {
    assert(definition.label.trim().length > 0);
    assert(definition.instructions.trim().length > 0);
    assertEquals(definition.levels.length, 5);
    assert(definition.levels.every((level) => level.trim().length > 0));
  }
});

Deno.test("classification definitions expose the complete tone taxonomy", () => {
  assertEquals(CLASSIFICATION_DEFINITIONS, [TONE_DEFINITION]);
  assertEquals(Object.keys(TONE_DEFINITION.choices), [
    "very casual",
    "casual",
    "neutral",
    "slightly formal",
    "formal",
  ]);
  assert(
    Object.values(TONE_DEFINITION.choices).every((description) =>
      description.trim().length > 0
    ),
  );
});

Deno.test("judgement definitions describe both boolean outcomes", () => {
  assertEquals(JUDGEMENT_DEFINITIONS, [NEEDS_FIX_DEFINITION]);
  assert(NEEDS_FIX_DEFINITION.instructions.trim().length > 0);
  assert(NEEDS_FIX_DEFINITION.criteria.true.trim().length > 0);
  assert(NEEDS_FIX_DEFINITION.criteria.false.trim().length > 0);
});
