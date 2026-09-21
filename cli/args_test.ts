import { assertEquals, assertThrows, fail } from "@std/assert";
import { type CliCommand, parseArgs } from "./args.ts";
import { CliUsageError } from "./errors.ts";

Deno.test("parseArgs returns lint defaults and a single message", () => {
  assertEquals(parseArgs(["Review this."]), {
    kind: "lint",
    message: "Review this.",
    contextId: "general",
    output: "text",
    minScore: undefined,
    noColor: false,
  });
});

Deno.test("parseArgs validates and converts lint options", () => {
  assertEquals(
    parseArgs([
      "--context=work",
      "--output",
      "json",
      "--min-score",
      "82.5",
      "--no-color",
    ]),
    {
      kind: "lint",
      message: undefined,
      contextId: "work",
      output: "json",
      minScore: 82.5,
      noColor: true,
    },
  );
  assertEquals(parseLint(["--", "--not-an-option"]).message, "--not-an-option");
});

Deno.test("parseArgs handles help and version before lint input", () => {
  assertEquals(parseArgs(["--help"]), { kind: "help" });
  assertEquals(parseArgs(["--version"]), { kind: "version" });
});

Deno.test("parseArgs rejects unknown and malformed options", () => {
  for (
    const args of [
      ["--unknown"],
      ["--output", "yaml"],
      ["--context="],
      ["--min-score="],
      ["--min-score", "NaN"],
      ["--min-score", "-0.1"],
      ["--min-score", "100.1"],
      ["one", "two"],
      [""],
    ]
  ) {
    assertThrows(() => parseArgs(args), CliUsageError);
  }
});

Deno.test("parseArgs accepts min-score boundaries", () => {
  assertEquals(parseLint(["--min-score", "0"]).minScore, 0);
  assertEquals(parseLint(["--min-score", "100"]).minScore, 100);
});

Deno.test("parseArgs preserves numeric-looking messages as text", () => {
  assertEquals(parseLint(["123"]).message, "123");
  assertEquals(parseLint(["--", "-1"]).message, "-1");
});

function parseLint(
  args: readonly string[],
): Extract<CliCommand, { kind: "lint" }> {
  const command = parseArgs(args);
  if (command.kind !== "lint") {
    fail("expected a lint command");
  }
  return command;
}
