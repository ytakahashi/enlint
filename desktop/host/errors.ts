import { InvalidJevResponseError } from "#infra/jev/answer_mapper.ts";
import { classifyJevError } from "#infra/jev/jev_evaluator.ts";
import {
  classifyOpenAiError,
  OpenAiAdviceRefusalError,
  OpenAiAdviceResponseError,
} from "#infra/llm/openai_advisor.ts";
import { InvalidOpenAiAdviceResponseError } from "#infra/llm/response_mapper.ts";
import type { DesktopError } from "../protocol/mod.ts";

/**
 * Reduces a failure to the kind the webview can act on. Messages and stacks
 * stay in the host log; the webview owns the wording it shows.
 */
export function toDesktopError(error: unknown): DesktopError {
  const jevKind = classifyJevError(error);
  if (jevKind !== undefined) {
    return { kind: jevKind, provider: "jev" };
  }
  const openAiKind = classifyOpenAiError(error);
  if (openAiKind !== undefined) {
    return { kind: openAiKind, provider: "openai" };
  }

  if (error instanceof InvalidJevResponseError) {
    return { kind: "invalid-response", provider: "jev" };
  }
  if (
    error instanceof InvalidOpenAiAdviceResponseError ||
    error instanceof OpenAiAdviceResponseError
  ) {
    return { kind: "invalid-response", provider: "openai" };
  }
  if (error instanceof OpenAiAdviceRefusalError) {
    return { kind: "refused", provider: "openai" };
  }
  return { kind: "unexpected" };
}
