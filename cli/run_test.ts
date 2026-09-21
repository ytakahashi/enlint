import { assertEquals, assertStringIncludes } from "@std/assert";
import type { EvaluationOutcome } from "#core/domain/evaluator.ts";
import { FakeEvaluator } from "#core/testing/fake_evaluator.ts";
import { run, type RunDependencies } from "./run.ts";

Deno.test("run evaluates a positional message and writes text output", async () => {
  const harness = createHarness(outcome(3.4));

  assertEquals(
    await run(["--context", "work", "Review this."], harness.dependencies),
    0,
  );
  assertStringIncludes(harness.stdout(), "Score: 85/100");
  assertEquals(harness.stderr(), "");
  assertEquals(harness.evaluator.requests[0].text, "Review this.");
  assertEquals(harness.evaluator.requests[0].profile.id, "work");
  assertEquals(harness.stdinReads(), 0);
});

Deno.test("run reads stdin and emits versioned JSON", async () => {
  const harness = createHarness(outcome(4), { stdinText: "From stdin\n" });

  assertEquals(
    await run(["--output", "json"], harness.dependencies),
    0,
  );
  const output = JSON.parse(harness.stdout());
  assertEquals(output.version, 1);
  assertEquals(output.text, "From stdin");
  assertEquals(harness.stdinReads(), 1);
});

Deno.test("run applies min-score only when it is specified", async () => {
  const defaultHarness = createHarness(outcome(3.2));
  assertEquals(await run(["Message"], defaultHarness.dependencies), 0);

  const equalHarness = createHarness(outcome(3.2));
  assertEquals(
    await run(["--min-score", "80", "Message"], equalHarness.dependencies),
    0,
  );

  const belowHarness = createHarness(outcome(3.2));
  assertEquals(
    await run(["--min-score", "80.1", "Message"], belowHarness.dependencies),
    1,
  );
});

Deno.test("run handles help and version without input or credentials", async () => {
  const help = createHarness(outcome(4), { credential: undefined });
  assertEquals(await run(["--help"], help.dependencies), 0);
  assertStringIncludes(help.stdout(), "Usage: enlint");
  assertEquals(help.evaluator.requests.length, 0);

  const version = createHarness(outcome(4), { credential: undefined });
  assertEquals(await run(["--version"], version.dependencies), 0);
  assertEquals(version.stdout(), "enlint 0.1.0\n");
});

Deno.test("run sends usage and input failures only to stderr", async () => {
  const unknown = createHarness(outcome(4));
  assertEquals(await run(["--unknown"], unknown.dependencies), 2);
  assertEquals(unknown.stdout(), "");
  assertStringIncludes(unknown.stderr(), "Unknown option");

  const tty = createHarness(outcome(4), { stdinTerminal: true });
  assertEquals(await run([], tty.dependencies), 2);
  assertEquals(tty.stdout(), "");
  assertStringIncludes(tty.stderr(), "Usage: enlint");

  const empty = createHarness(outcome(4), { stdinText: " \n" });
  assertEquals(await run(["--output", "json"], empty.dependencies), 2);
  assertEquals(empty.stdout(), "");
});

Deno.test("run reports unknown contexts and missing credentials before evaluation", async () => {
  const context = createHarness(outcome(4));
  assertEquals(
    await run(["--context", "unknown", "Message"], context.dependencies),
    2,
  );
  assertStringIncludes(context.stderr(), "Available contexts");

  const credential = createHarness(outcome(4), { credential: undefined });
  assertEquals(await run(["Message"], credential.dependencies), 2);
  assertEquals(credential.stdout(), "");
  assertStringIncludes(credential.stderr(), "AI_GATEWAY_API_KEY");
  assertEquals(credential.evaluator.requests.length, 0);
});

Deno.test("run leaves stdout empty when evaluation fails", async () => {
  const harness = createHarness(outcome(4));
  const failure = new Error("gateway unavailable");
  const dependencies: RunDependencies = {
    ...harness.dependencies,
    evaluator: {
      evaluate: () => Promise.reject(failure),
    },
  };

  assertEquals(await run(["--output", "json", "Message"], dependencies), 2);
  assertEquals(harness.stdout(), "");
  assertStringIncludes(harness.stderr(), "gateway unavailable");
});

Deno.test("run enables color only for an eligible text terminal", async () => {
  const colored = async (options: HarnessOptions, args: string[] = []) => {
    const harness = createHarness(outcome(4), options);
    assertEquals(await run([...args, "Message"], harness.dependencies), 0);
    return harness.stdout().includes("\u001b[");
  };

  assertEquals(await colored({ stdoutTerminal: true }), true);
  assertEquals(await colored({ stdoutTerminal: false }), false);
  assertEquals(await colored({ stdoutTerminal: true }, ["--no-color"]), false);
  assertEquals(
    await colored({ stdoutTerminal: true }, ["--output", "json"]),
    false,
  );

  // https://no-color.org: only a non-empty value disables color.
  assertEquals(
    await colored({ stdoutTerminal: true, noColorEnvironment: "" }),
    true,
  );
  assertEquals(
    await colored({ stdoutTerminal: true, noColorEnvironment: "1" }),
    false,
  );
});

type HarnessOptions = {
  readonly stdinText?: string;
  readonly stdinTerminal?: boolean;
  readonly stdoutTerminal?: boolean;
  readonly credential?: string | undefined;
  readonly noColorEnvironment?: string;
};

function createHarness(
  evaluationOutcome: EvaluationOutcome,
  options: HarnessOptions = {},
) {
  let stdout = "";
  let stderr = "";
  let stdinReads = 0;
  const evaluator = new FakeEvaluator(evaluationOutcome);
  const credential = Object.hasOwn(options, "credential")
    ? options.credential
    : "test-key";
  const dependencies: RunDependencies = {
    evaluator,
    stdin: {
      isTerminal: () => options.stdinTerminal ?? false,
      readText: () => {
        stdinReads++;
        return Promise.resolve(options.stdinText ?? "stdin message");
      },
    },
    stdout: {
      isTerminal: () => options.stdoutTerminal ?? false,
      write: (text) => {
        stdout += text;
        return Promise.resolve();
      },
    },
    stderr: {
      write: (text) => {
        stderr += text;
        return Promise.resolve();
      },
    },
    getEnv: (name) => {
      if (name === "AI_GATEWAY_API_KEY") return credential;
      if (name === "NO_COLOR") return options.noColorEnvironment;
      return undefined;
    },
    version: "0.1.0",
  };

  return {
    dependencies,
    evaluator,
    stdout: () => stdout,
    stderr: () => stderr,
    stdinReads: () => stdinReads,
  };
}

function outcome(rawLevel: number): EvaluationOutcome {
  const answer = {
    rawLevel,
    confidence: undefined,
    probabilities: undefined,
  };
  return {
    metrics: {
      naturalness: answer,
      grammar: answer,
      clarity: answer,
      contextFit: answer,
    },
    classifications: {
      tone: {
        value: "neutral",
        confidence: undefined,
        probabilities: undefined,
      },
    },
    judgements: {
      needsFix: { probability: 0.1, confidence: undefined },
    },
  };
}
