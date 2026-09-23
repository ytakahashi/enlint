import {
  type AdviceKind,
  adviseLintResult,
  type Advisor,
  type Evaluator,
  getBuiltInContextProfile,
  lintMessage,
} from "#core/mod.ts";
import type {
  AdviseRequest,
  Bindings,
  DesktopError,
  LintRequest,
  Result,
} from "../protocol/mod.ts";
import type { CredentialResolver } from "./credentials.ts";
import { toDesktopError } from "./errors.ts";
import { parseLintResult } from "./lint_result.ts";

export type HandlerDependencies = {
  readonly resolveCredential: CredentialResolver;
  /**
   * Adapters are built per request from a resolved key. The Keychain lookup is
   * asynchronous, and resolving the key here lets a missing credential be
   * reported as such before any provider is called.
   */
  readonly createEvaluator: (apiKey: string) => Evaluator;
  readonly createAdvisor: (apiKey: string) => Advisor;
  readonly clipboard: {
    readonly writeText: (text: string) => Promise<void>;
  };
  /** Receives every unexpected failure with its message and stack. */
  readonly reportError: (error: unknown) => void;
};

/**
 * Binding handlers. They keep no state between calls: advice is requested with
 * the lint result the webview already holds.
 *
 * Every handler resolves to a Result, whatever it is called with. Arguments
 * arrive as untyped JSON, so the declared parameter types are not checked at
 * run time; each handler validates their shape inside `attempt`, and malformed
 * input from the webview is reported as unexpected.
 */
export function createHandlers(dependencies: HandlerDependencies): Bindings {
  const attempt = async <T>(
    run: () => Promise<Result<T>>,
  ): Promise<Result<T>> => {
    try {
      return await run();
    } catch (error) {
      dependencies.reportError(error);
      return failure(toDesktopError(error));
    }
  };

  return {
    lint: (request) =>
      attempt(async () => {
        // Blank text is not rejected here: the webview disables Check for it,
        // and a blank request is otherwise a valid, if pointless, evaluation.
        const { text, contextId } = requireLintRequest(request);
        const profile = getBuiltInContextProfile(contextId);
        if (profile === undefined) {
          return failure({ kind: "unknown-context" });
        }

        const apiKey = await dependencies.resolveCredential("TYPESAFE_API_KEY");
        if (apiKey === undefined) {
          return failure({ kind: "missing-credentials", provider: "jev" });
        }
        const evaluator = dependencies.createEvaluator(apiKey);
        return success(await lintMessage({ text, profile }, evaluator));
      }),

    advise: (request) =>
      attempt(async () => {
        const { lintResult, kind } = requireAdviseRequest(request);
        // Resolved from the result itself so the advice always targets the
        // context that produced it.
        const profile = getBuiltInContextProfile(lintResult.contextId);
        if (profile === undefined) {
          return failure({ kind: "unknown-context" });
        }

        const apiKey = await dependencies.resolveCredential("OPENAI_API_KEY");
        if (apiKey === undefined) {
          return failure({ kind: "missing-credentials", provider: "openai" });
        }
        const advisor = dependencies.createAdvisor(apiKey);
        return success(
          await adviseLintResult({ lintResult, profile, kind }, advisor),
        );
      }),

    copyText: (text) =>
      attempt(async () => {
        // Without this check a missing argument would be written as "null".
        if (typeof text !== "string") {
          throw new TypeError("copyText requires a string");
        }
        try {
          await dependencies.clipboard.writeText(text);
        } catch (error) {
          dependencies.reportError(error);
          return failure({ kind: "clipboard" });
        }
        return success(null);
      }),
  };
}

function requireLintRequest(value: unknown): LintRequest {
  if (
    !isRecord(value) || typeof value.text !== "string" ||
    typeof value.contextId !== "string"
  ) {
    throw new TypeError("lint request requires text and contextId strings");
  }
  return { text: value.text, contextId: value.contextId };
}

/**
 * The lint result is validated in full before any credential lookup, because
 * the advisor forwards it to a paid provider.
 */
function requireAdviseRequest(value: unknown): AdviseRequest {
  if (!isRecord(value)) {
    throw new TypeError("advise request must be an object");
  }
  const kind = ADVICE_KINDS.find((candidate) => candidate === value.kind);
  if (kind === undefined) {
    throw new TypeError("advise request requires a known kind");
  }
  return { lintResult: parseLintResult(value.lintResult), kind };
}

const ADVICE_KINDS = [
  "explain",
  "fix",
  "both",
] as const satisfies readonly AdviceKind[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function success<T>(value: T): Result<T> {
  return { ok: true, value };
}

function failure<T>(error: DesktopError): Result<T> {
  return { ok: false, error };
}
