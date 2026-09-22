#!/usr/bin/env -S deno run --allow-env=TYPESAFE_API_KEY,OPENAI_*,NODE_OPTIONS,NO_COLOR --allow-net=api.typesafe.ai,api.openai.com

import { JevEvaluator } from "#infra/jev/jev_evaluator.ts";
import { OpenAiAdvisor } from "#infra/llm/openai_advisor.ts";
import { run } from "./run.ts";
import { VERSION } from "./version.ts";

const encoder = new TextEncoder();

if (import.meta.main) {
  const getEnv = (name: string) => Deno.env.get(name);
  Deno.exitCode = await run(Deno.args, {
    evaluator: new JevEvaluator({
      // Read the key lazily: `deno install` grants no permissions, so
      // --version and --help must not touch the environment.
      apiKey: () => getEnv("TYPESAFE_API_KEY") ?? "",
    }),
    advisor: new OpenAiAdvisor(),
    stdin: {
      isTerminal: () => Deno.stdin.isTerminal(),
      readText: () => new Response(Deno.stdin.readable).text(),
    },
    stdout: {
      isTerminal: () => Deno.stdout.isTerminal(),
      write: (text) => writeAll(Deno.stdout, text),
    },
    stderr: {
      write: (text) => writeAll(Deno.stderr, text),
    },
    getEnv,
    version: VERSION,
  });
}

async function writeAll(
  writer: { write(data: Uint8Array): Promise<number> },
  text: string,
): Promise<void> {
  const data = encoder.encode(text);
  let written = 0;
  while (written < data.length) {
    const count = await writer.write(data.subarray(written));
    if (count === 0) {
      throw new Error("output stream accepted no data");
    }
    written += count;
  }
}
