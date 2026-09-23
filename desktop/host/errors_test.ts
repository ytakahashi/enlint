import { assertEquals } from "@std/assert";
import { InvalidJevResponseError } from "#infra/jev/answer_mapper.ts";
import {
  JevAuthenticationError,
  JevConnectionError,
  JevRateLimitError,
  JevRequestTimeoutError,
  JevTimeoutError,
} from "#infra/jev/jev_evaluator.ts";
import {
  OpenAiAdviceRefusalError,
  OpenAiAdviceResponseError,
  OpenAiAuthenticationError,
  OpenAiConnectionError,
  OpenAiRateLimitError,
  OpenAiTimeoutError,
} from "#infra/llm/openai_advisor.ts";
import { InvalidOpenAiAdviceResponseError } from "#infra/llm/response_mapper.ts";
import type { DesktopError } from "../protocol/mod.ts";
import { toDesktopError } from "./errors.ts";

Deno.test("toDesktopError attributes provider failures to their provider", () => {
  const cause = new Error("SDK failure");
  const cases: readonly [unknown, DesktopError][] = [
    [new JevAuthenticationError(cause), {
      kind: "authentication",
      provider: "jev",
    }],
    [new JevRateLimitError(cause), { kind: "rate-limit", provider: "jev" }],
    [new JevTimeoutError(cause), { kind: "timeout", provider: "jev" }],
    [new JevRequestTimeoutError("deadline"), {
      kind: "timeout",
      provider: "jev",
    }],
    [new JevConnectionError(cause), { kind: "connection", provider: "jev" }],
    [new InvalidJevResponseError("bad"), {
      kind: "invalid-response",
      provider: "jev",
    }],
    [new OpenAiAuthenticationError(cause), {
      kind: "authentication",
      provider: "openai",
    }],
    [new OpenAiRateLimitError(cause), {
      kind: "rate-limit",
      provider: "openai",
    }],
    [new OpenAiTimeoutError(cause), { kind: "timeout", provider: "openai" }],
    [new OpenAiConnectionError(cause), {
      kind: "connection",
      provider: "openai",
    }],
    [new InvalidOpenAiAdviceResponseError("bad"), {
      kind: "invalid-response",
      provider: "openai",
    }],
    [new OpenAiAdviceResponseError("incomplete"), {
      kind: "invalid-response",
      provider: "openai",
    }],
    [new OpenAiAdviceRefusalError("no"), {
      kind: "refused",
      provider: "openai",
    }],
  ];

  for (const [error, expected] of cases) {
    assertEquals(toDesktopError(error), expected, String(error));
  }
});

Deno.test("toDesktopError reports anything else as unexpected", () => {
  assertEquals(toDesktopError(new TypeError("contract violation")), {
    kind: "unexpected",
  });
  assertEquals(toDesktopError("thrown string"), { kind: "unexpected" });
});
