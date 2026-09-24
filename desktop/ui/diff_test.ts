import { assertEquals } from "@std/assert";
import { computeWordDiff, type DiffSegment } from "./diff.ts";

function side(
  segments: readonly DiffSegment[],
  omit: DiffSegment["kind"],
): string {
  return segments.filter(({ kind }) => kind !== omit)
    .map(({ text }) => text)
    .join("");
}

Deno.test("computeWordDiff marks replaced and removed words", () => {
  assertEquals(
    computeWordDiff(
      "She go to work, every day.",
      "She goes to work every day.",
    ),
    [
      { kind: "equal", text: "She " },
      { kind: "removed", text: "go" },
      { kind: "added", text: "goes" },
      { kind: "equal", text: " to work" },
      { kind: "removed", text: "," },
      { kind: "equal", text: " every day." },
    ],
  );
});

Deno.test("computeWordDiff reports identical text as one equal segment", () => {
  assertEquals(computeWordDiff("Thanks.", "Thanks."), [
    { kind: "equal", text: "Thanks." },
  ]);
});

Deno.test("computeWordDiff reproduces both sides, including whitespace", () => {
  const cases = [
    ["I will  check it\nlater.", "I'll check it later."],
    ["", "A new sentence."],
    ["Remove everything.", ""],
  ] as const;

  for (const [before, after] of cases) {
    const segments = computeWordDiff(before, after);
    assertEquals(side(segments, "added"), before);
    assertEquals(side(segments, "removed"), after);
  }
});
