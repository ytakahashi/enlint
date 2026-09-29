import { assertEquals, assertStringIncludes } from "@std/assert";
import type { EvaluationOutcome } from "#core/domain/evaluator.ts";
import {
  FakeAdvisor,
  type FakeAdvisorResponse,
} from "#core/testing/fake_advisor.ts";
import { FakeEvaluator } from "#core/testing/fake_evaluator.ts";
import {
  OpenAiAuthenticationError,
  OpenAiConnectionError,
  OpenAiRateLimitError,
  OpenAiTimeoutError,
} from "#infra/llm/openai_advisor.ts";
import { CLEAR_LINE } from "./progress.ts";
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
  assertEquals(harness.advisor.requests.length, 0);
  assertEquals(harness.stdinReads(), 0);
});

Deno.test("run reads stdin and emits versioned JSON", async () => {
  const harness = createHarness(outcome(4), { stdinText: "From stdin\n" });

  assertEquals(
    await run(["--output", "json"], harness.dependencies),
    0,
  );
  const output = JSON.parse(harness.stdout());
  assertEquals(output.version, 2);
  assertEquals(output.text, "From stdin");
  assertEquals(output.advice, null);
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
  const help = createHarness(outcome(4), {
    credential: undefined,
    openAiCredential: undefined,
  });
  assertEquals(await run(["--help"], help.dependencies), 0);
  assertStringIncludes(help.stdout(), "Usage: enlint");
  assertEquals(help.evaluator.requests.length, 0);
  assertEquals(help.advisor.requests.length, 0);

  const version = createHarness(outcome(4), {
    credential: undefined,
    openAiCredential: undefined,
  });
  assertEquals(await run(["--version"], version.dependencies), 0);
  assertEquals(version.stdout(), "enlint 0.1.0\n");
});

Deno.test("run requests explanations and rewrites together for issues", async () => {
  const harness = createHarness(outcome(3));

  assertEquals(await run(["Message"], harness.dependencies), 0);
  assertEquals(harness.evaluator.requests.length, 1);
  assertEquals(harness.advisor.requests.length, 1);
  assertEquals(harness.advisor.requests[0].kind, "both");
  assertEquals(harness.advisor.requests[0].lintResult.text, "Message");
  assertEquals(harness.advisor.requests[0].profile.id, "general");
  assertStringIncludes(harness.stdout(), "Suggested rewrites");
  assertEquals(harness.stderr(), "");
});

Deno.test("run skips advice when the result has no issues", async () => {
  // 3.4 scores 85, at or above every issue threshold.
  const harness = createHarness(outcome(3.4), {
    openAiCredential: undefined,
  });

  assertEquals(await run(["Message"], harness.dependencies), 0);
  assertEquals(harness.advisor.requests.length, 0);
  assertEquals(harness.stdout().includes("Suggested rewrites"), false);
  assertEquals(harness.stderr(), "");
});

Deno.test("run skips advice with --lint-only", async () => {
  const harness = createHarness(outcome(3), { openAiCredential: undefined });

  assertEquals(
    await run(
      ["--lint-only", "--output", "json", "Message"],
      harness.dependencies,
    ),
    0,
  );
  assertEquals(harness.advisor.requests.length, 0);
  assertEquals(JSON.parse(harness.stdout()).advice, null);
  assertEquals(harness.stderr(), "");
});

Deno.test("run writes the text lint result before requesting advice", async () => {
  const harness = createHarness(outcome(3));
  let stdoutAtAdvice: string | undefined;
  const dependencies: RunDependencies = {
    ...harness.dependencies,
    advisor: {
      advise(request) {
        stdoutAtAdvice = harness.stdout();
        return harness.advisor.advise(request);
      },
    },
  };

  assertEquals(await run(["Message"], dependencies), 0);
  assertEquals(
    stdoutAtAdvice?.endsWith("Status: Understandable, but could be improved\n"),
    true,
  );
  assertEquals(stdoutAtAdvice?.includes("Suggested rewrites"), false);
  assertStringIncludes(harness.stdout(), "Suggested rewrites");
});

Deno.test("run writes JSON only once advice has settled", async () => {
  const harness = createHarness(outcome(3));
  let stdoutAtAdvice: string | undefined;
  const dependencies: RunDependencies = {
    ...harness.dependencies,
    advisor: {
      advise(request) {
        stdoutAtAdvice = harness.stdout();
        return harness.advisor.advise(request);
      },
    },
  };

  assertEquals(await run(["--output", "json", "Message"], dependencies), 0);
  assertEquals(stdoutAtAdvice, "");
  assertEquals(JSON.parse(harness.stdout()).advice, {
    explanations: [],
    candidates: [],
  });
});

Deno.test("run skips advice with a notice when OPENAI_API_KEY is missing", async () => {
  for (const openAiCredential of [undefined, " "]) {
    const harness = createHarness(outcome(3), { openAiCredential });

    assertEquals(
      await run(["--min-score", "80.1", "Message"], harness.dependencies),
      1,
    );
    assertStringIncludes(harness.stdout(), "Score: 75/100");
    assertEquals(harness.stdout().includes("Suggested rewrites"), false);
    assertStringIncludes(harness.stderr(), "OPENAI_API_KEY");
    assertStringIncludes(harness.stderr(), "--lint-only");
    assertEquals(harness.advisor.requests.length, 0);
  }
});

Deno.test("run includes successful advice in JSON", async () => {
  const advice = {
    explanations: [],
    candidates: [{ text: "Rewritten message.", rationale: "It is clearer." }],
  };
  // Advice is only requested for a result that flagged something, so this
  // scores below the issue-free threshold rather than at it.
  const harness = createHarness(outcome(3), {
    advisorResponse: { outcome: advice },
  });

  assertEquals(
    await run(["--output", "json", "Message"], harness.dependencies),
    0,
  );
  assertEquals(JSON.parse(harness.stdout()).advice, advice);
  assertEquals(harness.stderr(), "");
});

Deno.test("run keeps lint output and exit status when advice fails", async () => {
  const failure = createHarness(outcome(3), {
    advisorResponse: { error: new Error("advisor unavailable") },
  });

  assertEquals(
    await run(
      ["--output", "json", "--min-score", "80.1", "Message"],
      failure.dependencies,
    ),
    1,
  );
  assertEquals(JSON.parse(failure.stdout()).advice, null);
  assertStringIncludes(failure.stderr(), "Advice failed: advisor unavailable");
});

Deno.test("run reports classified advice failures without discarding lint output", async () => {
  const cause = new Error("SDK failure");
  const cases = [
    {
      error: new OpenAiAuthenticationError(cause),
      message: "OpenAI authentication failed. Check OPENAI_API_KEY.",
    },
    {
      error: new OpenAiRateLimitError(cause),
      message: "The advice service is temporarily unavailable after retrying.",
    },
    {
      error: new OpenAiTimeoutError(cause),
      message: "The advice service did not respond in time.",
    },
    {
      error: new OpenAiConnectionError(cause),
      message:
        "Unable to reach the advice service. Check the network connection.",
    },
  ] as const;

  for (const { error, message } of cases) {
    const harness = createHarness(outcome(3), {
      advisorResponse: { error },
    });

    assertEquals(await run(["Message"], harness.dependencies), 0);
    assertStringIncludes(harness.stdout(), "Score: 75/100");
    assertEquals(harness.stderr(), `enlint: ${message}\n`);
    assertEquals(harness.evaluator.requests.length, 1);
    assertEquals(harness.advisor.requests.length, 1);
  }
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

Deno.test("run reports unknown contexts and a missing evaluation key before evaluation", async () => {
  const context = createHarness(outcome(4));
  assertEquals(
    await run(["--context", "unknown", "Message"], context.dependencies),
    2,
  );
  assertStringIncludes(context.stderr(), "Available contexts");

  const credential = createHarness(outcome(4), { credential: undefined });
  assertEquals(await run(["Message"], credential.dependencies), 2);
  assertEquals(credential.stdout(), "");
  assertStringIncludes(credential.stderr(), "TYPESAFE_API_KEY");
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

Deno.test("run shows progress on a terminal and clears it before each write", async () => {
  const harness = createHarness(outcome(3), { stderrTerminal: true });

  assertEquals(await run(["Message"], harness.dependencies), 0);
  assertEquals(
    harness.writes.map(({ stream, text }) =>
      stream === "stderr" ? text : `stdout: ${text.split("\n")[0]}`
    ),
    [
      `${CLEAR_LINE}⠋ Evaluating…`,
      CLEAR_LINE,
      "stdout: Score: 75/100",
      `${CLEAR_LINE}⠋ Generating advice…`,
      CLEAR_LINE,
      "stdout: ",
    ],
  );
});

Deno.test("run clears progress before JSON and before advice notices", async () => {
  const harness = createHarness(outcome(3), {
    stderrTerminal: true,
    openAiCredential: undefined,
  });

  assertEquals(
    await run(["--output", "json", "Message"], harness.dependencies),
    0,
  );
  assertEquals(
    harness.writes.map(({ stream, text }) =>
      stream === "stdout"
        ? "stdout"
        : text.startsWith("enlint: ")
        ? "notice"
        : text
    ),
    [
      `${CLEAR_LINE}⠋ Evaluating…`,
      CLEAR_LINE,
      `${CLEAR_LINE}⠋ Generating advice…`,
      CLEAR_LINE,
      "stdout",
      "notice",
    ],
  );
});

Deno.test("run clears progress before reporting an evaluation failure", async () => {
  const harness = createHarness(outcome(3), { stderrTerminal: true });
  const dependencies: RunDependencies = {
    ...harness.dependencies,
    evaluator: {
      evaluate: () => Promise.reject(new Error("gateway unavailable")),
    },
  };

  assertEquals(await run(["Message"], dependencies), 2);
  assertEquals(harness.stdout(), "");
  assertEquals(
    harness.stderr(),
    `${CLEAR_LINE}⠋ Evaluating…${CLEAR_LINE}enlint: Evaluation failed: gateway unavailable\n`,
  );
});

Deno.test("run shows no progress when stderr is not a terminal", async () => {
  const harness = createHarness(outcome(3));

  assertEquals(await run(["Message"], harness.dependencies), 0);
  assertEquals(harness.stderr(), "");
  assertEquals(harness.repeats(), 0);
});

type HarnessOptions = {
  readonly stdinText?: string;
  readonly stdinTerminal?: boolean;
  readonly stdoutTerminal?: boolean;
  readonly stderrTerminal?: boolean;
  readonly credential?: string | undefined;
  readonly openAiCredential?: string | undefined;
  readonly noColorEnvironment?: string;
  readonly advisorResponse?: FakeAdvisorResponse;
};

function createHarness(
  evaluationOutcome: EvaluationOutcome,
  options: HarnessOptions = {},
) {
  let stdout = "";
  let stderr = "";
  let stdinReads = 0;
  let repeats = 0;
  /** Both streams in write order, to check where the indicator is cleared. */
  const writes: { readonly stream: "stdout" | "stderr"; text: string }[] = [];
  const evaluator = new FakeEvaluator(evaluationOutcome);
  const advisor = new FakeAdvisor(
    options.advisorResponse ?? {
      outcome: { explanations: [], candidates: [] },
    },
  );
  const credential = Object.hasOwn(options, "credential")
    ? options.credential
    : "test-key";
  const openAiCredential = Object.hasOwn(options, "openAiCredential")
    ? options.openAiCredential
    : "test-openai-key";
  const dependencies: RunDependencies = {
    evaluator,
    advisor,
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
        writes.push({ stream: "stdout", text });
        return Promise.resolve();
      },
    },
    stderr: {
      isTerminal: () => options.stderrTerminal ?? false,
      write: (text) => {
        stderr += text;
        writes.push({ stream: "stderr", text });
        return Promise.resolve();
      },
    },
    // Never ticks: each indicator draws only its first frame.
    scheduler: {
      repeat: () => {
        repeats++;
        return () => {};
      },
    },
    getEnv: (name) => {
      if (name === "TYPESAFE_API_KEY") return credential;
      if (name === "OPENAI_API_KEY") return openAiCredential;
      if (name === "NO_COLOR") return options.noColorEnvironment;
      return undefined;
    },
    version: "0.1.0",
  };

  return {
    dependencies,
    evaluator,
    advisor,
    stdout: () => stdout,
    stderr: () => stderr,
    stdinReads: () => stdinReads,
    repeats: () => repeats,
    writes,
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
