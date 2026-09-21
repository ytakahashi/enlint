#!/usr/bin/env -S deno run --allow-env=AI_GATEWAY_API_KEY,VERCEL_*,OPENAI_*,NODE_OPTIONS,NO_COLOR --allow-net --allow-sys=hostname

import { JevEvaluator } from "#infra/jev/jev_evaluator.ts";
import { OpenAiAdvisor } from "#infra/llm/openai_advisor.ts";
import { run } from "./run.ts";
import { VERSION } from "./version.ts";

const encoder = new TextEncoder();

if (import.meta.main) {
  Deno.exitCode = await run(Deno.args, {
    evaluator: new JevEvaluator(),
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
    getEnv: (name) => Deno.env.get(name),
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
