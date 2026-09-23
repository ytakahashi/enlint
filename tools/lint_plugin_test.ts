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

Deno.test("layer-dependencies confines the manifest import to the version module", () => {
  const message = "deno.json may only be imported by cli/version.ts";
  const importManifest = [
    'import config from "../deno.json" with { type: "json" };',
  ];

  assertEquals(lint("cli/version.ts", importManifest), []);
  assertEquals(lint("cli/args.ts", importManifest), [message]);
  assertEquals(
    lint("core/domain/metric.ts", [
      'import config from "../../deno.json" with { type: "json" };',
    ]),
    [message],
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

Deno.test("layer-dependencies separates desktop areas by runtime", () => {
  assertEquals(
    lint("desktop/main.ts", [
      'import { createHandlers } from "./host/handlers.ts";',
      'import type { Bindings } from "./protocol/mod.ts";',
      'import { JevEvaluator } from "#infra/jev/jev_evaluator.ts";',
      'import { lintMessage } from "#core/mod.ts";',
    ]),
    [],
  );
  assertEquals(
    lint("desktop/host/handlers.ts", [
      'import type { Bindings } from "../protocol/mod.ts";',
      'import { session } from "../ui/state/session.ts";',
      'import { run } from "../main.ts";',
    ]),
    [
      "desktop/host may not depend on desktop/ui",
      "desktop/host may not depend on desktop/main.ts",
    ],
  );
  assertEquals(
    lint("desktop/ui/state/session.ts", [
      'import type { Bindings } from "../../protocol/mod.ts";',
      'import { isLowConfidence } from "#core/mod.ts";',
      'import { signal } from "@preact/signals";',
      'import { createHandlers } from "../../host/handlers.ts";',
      'import { JevEvaluator } from "#infra/jev/jev_evaluator.ts";',
    ]),
    [
      "desktop/ui may not depend on desktop/host",
      "desktop/ui may not depend on infra",
    ],
  );
  assertEquals(
    lint("desktop/protocol/mod.ts", [
      'import type { LintResult } from "#core/mod.ts";',
      'import type { Session } from "../ui/state/session.ts";',
      'import type { Advisor } from "#infra/llm/openai_advisor.ts";',
    ]),
    [
      "desktop/protocol may not depend on desktop/ui",
      "desktop/protocol may not depend on infra",
    ],
  );
});

Deno.test("layer-dependencies requires desktop modules to belong to an area", () => {
  const message =
    "desktop modules must be desktop/main.ts or live under desktop/host, desktop/protocol, or desktop/ui";
  // Reported once per file, whatever it imports, and even with no imports.
  assertEquals(
    lint("desktop/helpers.ts", [
      'import { a } from "./host/a.ts";',
      'import { signal } from "@preact/signals";',
    ]),
    [message],
  );
  assertEquals(lint("desktop/helpers.ts", ["export const x = 1;"]), [message]);
  assertEquals(
    lint("desktop/shared/format.ts", ["export const x = 1;"]),
    [message],
  );
  assertEquals(lint("desktop/host/handlers.ts", ["export const x = 1;"]), []);
  assertEquals(
    lint("desktop/host/handlers.ts", ['import { a } from "../shared/a.ts";']),
    ["desktop/host may not depend on files outside desktop areas"],
  );
});

Deno.test("layer-dependencies lets only the composition root load UI assets", () => {
  const entryMessage =
    "desktop/main.ts may import desktop/ui only as text or bytes";

  assertEquals(
    lint("desktop/main.ts", [
      'import html from "./ui/index.html" with { type: "text" };',
      'import css from "./ui/style.css" with { type: "text" };',
      'import app from "./_dist/app.js" with { type: "text" };',
      'import icon from "./ui/icon.png" with { type: "bytes" };',
    ]),
    [],
  );
  // Webview code must never run in Deno, and a JSON module is still a module.
  assertEquals(
    lint("desktop/main.ts", [
      'import { App } from "./ui/main.tsx";',
      'import app from "./_dist/app.js";',
      'import config from "./ui/config.json" with { type: "json" };',
    ]),
    Array(3).fill(entryMessage),
  );
  // The host receives assets from the composition root instead of reading them.
  assertEquals(
    lint("desktop/host/assets.ts", [
      'import html from "../ui/index.html" with { type: "text" };',
      'import app from "../_dist/app.js" with { type: "text" };',
    ]),
    Array(2).fill("desktop/host may not depend on desktop/ui"),
  );
  // The exception covers desktop areas, not the layer rule.
  assertEquals(
    lint("desktop/main.ts", [
      'import help from "../cli/help.txt" with { type: "text" };',
    ]),
    ["desktop may not depend on cli"],
  );
});

Deno.test("layer-dependencies keeps packages out of the desktop protocol", () => {
  assertEquals(
    lint("desktop/protocol/mod.ts", ['import { h } from "preact";']),
    ["desktop/protocol modules may not import external packages"],
  );
  assertEquals(
    lint("desktop/protocol/mod_test.ts", [
      'import { assertEquals } from "@std/assert";',
    ]),
    [],
  );
});

Deno.test("layer-dependencies isolates the diff dependency", () => {
  const message = "diff may only be imported by desktop/ui/diff.ts";

  assertEquals(
    lint("desktop/ui/diff.ts", ['import { diffWords } from "diff";']),
    [],
  );
  assertEquals(
    lint("desktop/ui/components/candidate.tsx", [
      'import { diffWords } from "npm:diff@8.0.2";',
    ]),
    [message],
  );
  assertEquals(
    lint("desktop/host/handlers.ts", ['import { diffWords } from "diff";']),
    [message],
  );
  assertEquals(
    lint("desktop/ui/diff.ts", ['import value from "diff-match-patch";']),
    [],
  );
});

Deno.test("webview-no-deno-api reports Deno APIs in webview code only", () => {
  const message =
    "desktop/ui and desktop/protocol run in the webview and must not use Deno APIs";
  const useDeno = ['export const home = Deno.env.get("HOME");'];

  assertEquals(lint("desktop/ui/state/session.ts", useDeno), [message]);
  assertEquals(
    lint("desktop/protocol/mod.ts", [
      "export const runtime = globalThis.Deno;",
    ]),
    [message],
  );
  assertEquals(lint("desktop/host/credentials.ts", useDeno), []);
  assertEquals(lint("desktop/main.ts", useDeno), []);
  assertEquals(
    lint("desktop/ui/state/session_test.ts", [
      'Deno.test("session", () => {});',
    ]),
    [],
  );
});
