import { assertEquals } from "@std/assert";
import plugin from "./lint_plugin.ts";

function lint(path: string, lines: readonly string[]): string[] {
  return Deno.lint.runPlugin(plugin, path, lines.join("\n"))
    .map((diagnostic) => diagnostic.message);
}

Deno.test("layer-dependencies rejects imports toward outer layers", () => {
  // One case per import form, since each is handled by its own visitor.
  assertEquals(
    lint("core/application/use_case.ts", [
      'import { A } from "#infra/a.ts";',
      'export { B } from "../../infra/b.ts";',
      'export * from "#infra/c.ts";',
      'await import("#infra/d.ts");',
    ]),
    Array(4).fill("core may not depend on infra"),
  );

  assertEquals(lint("cli/main.ts", ['import { A } from "#infra/a.ts";']), []);
  assertEquals(
    lint("tests/golden_test.ts", ['import { run } from "../cli/run.ts";']),
    [],
  );
});

Deno.test("layer-dependencies limits external dependencies from core", () => {
  const importAssert = ['import { assert } from "@std/assert";'];

  assertEquals(lint("core/domain/entity.ts", importAssert), [
    "core modules may not import external packages",
  ]);
  assertEquals(lint("core/domain/entity_test.ts", importAssert), []);
  assertEquals(lint("cli/main.ts", ['import { p } from "@std/cli";']), []);
});

Deno.test("layer-dependencies exposes Core through its public entry point", () => {
  const message =
    "infra production modules must import Core through core/mod.ts";

  assertEquals(
    lint("core/application/lint_message.ts", [
      'import { METRIC_DEFINITIONS } from "#core/domain/metric.ts";',
    ]),
    [],
  );
  assertEquals(
    lint("infra/jev/adapter.ts", [
      'import type { Evaluator } from "#core/domain/evaluator.ts";',
    ]),
    [message],
  );
  assertEquals(
    lint("infra/jev/adapter.ts", [
      'import type { Evaluator } from "#core/mod.ts";',
    ]),
    [],
  );
  assertEquals(
    lint("infra/jev/adapter_test.ts", [
      'import type { Evaluator } from "#core/domain/evaluator.ts";',
    ]),
    [],
  );
  assertEquals(
    lint("tools/golden/tuning.ts", [
      'import { READY_STATUS_SCORE_THRESHOLD } from "#core/application/_thresholds.ts";',
    ]),
    [],
  );
  assertEquals(
    lint("tests/helper.ts", [
      'import type { EvaluationRequest } from "#core/domain/evaluator.ts";',
    ]),
    [],
  );
  assertEquals(
    lint("cli/main.ts", [
      'import { lintMessage } from "../core/application/lint_message.ts";',
    ]),
    ["cli production modules must import Core through core/mod.ts"],
  );
});

Deno.test("layer-dependencies isolates the TypeSafe dependency", () => {
  const message =
    "@typesafe-ai/sdk may only be imported by infra/jev/jev_evaluator.ts";
  const importSdk = ['import { TypeSafeClient } from "@typesafe-ai/sdk";'];

  assertEquals(lint("infra/jev/jev_evaluator.ts", importSdk), []);
  assertEquals(lint("infra/jev/question_builder.ts", importSdk), [message]);
  assertEquals(
    lint("cli/main.ts", [
      'import type { Questions } from "npm:@typesafe-ai/sdk@0.6.0";',
    ]),
    [message],
  );
});

Deno.test("layer-dependencies isolates the openai dependency", () => {
  const message = "openai may only be imported by infra/llm/openai_advisor.ts";

  assertEquals(
    lint("infra/llm/openai_advisor.ts", ['import OpenAI from "openai";']),
    [],
  );
  assertEquals(
    lint("infra/llm/prompt_builder.ts", [
      'import type { Response } from "openai/resources/responses";',
    ]),
    [message],
  );
  assertEquals(
    lint("cli/errors.ts", ['import OpenAI from "npm:openai@7.20.0";']),
    [message],
  );
  assertEquals(
    lint("infra/llm/client.ts", ['import value from "openai-compatible";']),
    [],
  );
});

Deno.test("core-no-deno-api reports Deno APIs used in core only", () => {
  assertEquals(
    lint("core/domain/entity.ts", [
      'export const home = Deno.env.get("HOME");',
      "export const runtime = Deno;",
      "export type Runtime = typeof Deno;",
      "export const cwd = globalThis.Deno.cwd();",
      "export function read(entry: Deno.DirEntry): string {",
      "  return entry.name;",
      "}",
    ]).length,
    5,
  );

  // Identifiers that share the name without referring to the global.
  assertEquals(
    lint("core/domain/entity.ts", [
      "const container = { Deno: 1 };",
      "export const value = container.Deno;",
    ]),
    [],
  );

  assertEquals(
    lint("infra/config/loader.ts", ['export const h = Deno.env.get("HOME");']),
    [],
  );
  assertEquals(
    lint("core/domain/entity_test.ts", [
      'Deno.test("core behavior", () => {});',
    ]),
    [],
  );
});
