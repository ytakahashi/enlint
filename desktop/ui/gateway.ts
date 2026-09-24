import type { Bindings, Result } from "../protocol/mod.ts";

/**
 * What the UI calls to reach the host. The UI depends on this rather than on
 * the webview's `bindings` global, so its state can be tested with a fake.
 */
export type EnlintGateway = Bindings;

/**
 * Adapts the webview's `bindings` proxy.
 *
 * The host resolves every binding to a Result, but the call itself can still
 * reject, for example when a binding is not registered or the host fails while
 * encoding a value. Those rejections become unexpected failures, so callers
 * only ever handle Results.
 */
export function createBindingsGateway(bindings: Bindings): EnlintGateway {
  return {
    lint: (request) => settle(() => bindings.lint(request)),
    advise: (request) => settle(() => bindings.advise(request)),
    copyText: (text) => settle(() => bindings.copyText(text)),
  };
}

async function settle<T>(call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call();
  } catch {
    return { ok: false, error: { kind: "unexpected" } };
  }
}
