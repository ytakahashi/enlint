import { assertEquals, assertThrows } from "@std/assert";
import {
  loadGoldenCorpus,
  parseGoldenCorpus,
  validateGoldenCorpusCoverage,
} from "./corpus.ts";

Deno.test("loadGoldenCorpus validates the checked-in corpus", async () => {
  const corpus = await loadGoldenCorpus();

  assertEquals(corpus.version, 1);
  assertEquals(corpus.pairs.length, 25);
  assertEquals(
    corpus.pairs.filter(({ split }) => split === "validation").length,
    8,
  );
});

Deno.test("parseGoldenCorpus rejects duplicate IDs and invalid labels", () => {
  const pair = validPair();
  assertThrows(
    () => parseGoldenCorpus({ version: 1, pairs: [pair, pair] }),
    TypeError,
    'duplicate golden pair ID "pair-01"',
  );
  assertThrows(
    () =>
      parseGoldenCorpus({
        version: 1,
        pairs: [{ ...pair, context: "unknown" }],
      }),
    TypeError,
    "context must be one of",
  );
});

Deno.test("validateGoldenCorpusCoverage rejects an undersized corpus", () => {
  const corpus = parseGoldenCorpus({ version: 1, pairs: [validPair()] });

  assertThrows(
    () => validateGoldenCorpusCoverage(corpus),
    RangeError,
    "between 20 and 30 pairs",
  );
});

function validPair(): Readonly<Record<string, unknown>> {
  return {
    id: "pair-01",
    context: "work",
    focus: "grammar",
    split: "calibration",
    intent: "Ask for a review.",
    better: {
      text: "Could you review this?",
      expected: {
        sendability: "ready",
        focusSeverity: "none",
        acceptableTones: ["neutral"],
      },
    },
    worse: {
      text: "Could you reviews this?",
      expected: {
        sendability: "revise",
        focusSeverity: "medium",
        acceptableTones: ["neutral"],
      },
    },
  };
}
