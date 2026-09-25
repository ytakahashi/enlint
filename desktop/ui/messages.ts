import type { Status } from "#core/mod.ts";
import type {
  DesktopError,
  DesktopErrorKind,
  Provider,
} from "../protocol/mod.ts";

export const STATUS_LABELS = {
  ready: "Ready to send",
  improvable: "Understandable, but could be improved",
  "needs-revision": "Needs revision",
} as const satisfies Readonly<Record<Status, string>>;

const SERVICES = {
  jev: { name: "The evaluation service", variable: "TYPESAFE_API_KEY" },
  openai: { name: "The advice service", variable: "OPENAI_API_KEY" },
} as const satisfies Readonly<
  Record<Provider, { readonly name: string; readonly variable: string }>
>;

const MESSAGES = {
  "missing-credentials": ({ variable }) =>
    `Set ${variable} in the Keychain (service "enlint", account "${variable}") or in the environment, then check again.`,
  authentication: ({ name, variable }) =>
    `${name} rejected the API key. Check ${variable}.`,
  "rate-limit": ({ name }) =>
    `${name} is temporarily unavailable after retrying. Try again shortly.`,
  timeout: ({ name }) => `${name} did not respond in time.`,
  connection: ({ name }) =>
    `Unable to reach ${name.toLowerCase()}. Check the network connection.`,
  "invalid-response": ({ name }) =>
    `${name} returned a response enlint could not use. Try again.`,
  refused: () => "The advice service declined to advise on this text.",
  "unknown-context": () => "The selected context is not available.",
  clipboard: () => "Could not copy to the clipboard.",
  unexpected: () => "Something went wrong. Try again.",
} as const satisfies Readonly<
  Record<
    DesktopErrorKind,
    (service: { readonly name: string; readonly variable: string }) => string
  >
>;

/**
 * The host reports only a kind and a provider; the wording shown for it lives
 * here, where the UI can choose it.
 */
export function errorMessage(error: DesktopError): string {
  // Errors that belong to no provider never use the service in their message.
  const service = SERVICES[error.provider ?? "jev"];
  return MESSAGES[error.kind](service);
}
