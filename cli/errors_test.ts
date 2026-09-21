import { assertEquals } from "@std/assert";
import { CliExecutionError, executionErrorMessage } from "./errors.ts";

Deno.test("executionErrorMessage preserves deliberate CLI errors", () => {
  assertEquals(
    executionErrorMessage(new CliExecutionError("Set a credential.")),
    "Set a credential.",
  );
});

Deno.test("executionErrorMessage maps service status codes through causes", () => {
  assertEquals(
    executionErrorMessage(new Error("request", { cause: { statusCode: 401 } })),
    "Authentication failed. Check AI_GATEWAY_API_KEY.",
  );
  assertEquals(
    executionErrorMessage(new Error("request", { cause: { status: 503 } })),
    "The evaluation service is temporarily unavailable after retrying.",
  );
});

Deno.test("executionErrorMessage maps timeout and network failures", () => {
  const timeout = new Error("deadline");
  timeout.name = "JevRequestTimeoutError";
  assertEquals(
    executionErrorMessage(timeout),
    "The evaluation service did not respond in time.",
  );
  assertEquals(
    executionErrorMessage(
      new Error("request", { cause: { code: "ENETUNREACH" } }),
    ),
    "Unable to reach the evaluation service. Check the network connection.",
  );
});

Deno.test("executionErrorMessage handles cyclic causes", () => {
  const error = new Error("gateway unavailable");
  Object.defineProperty(error, "cause", { value: error });

  assertEquals(
    executionErrorMessage(error),
    "Evaluation failed: gateway unavailable",
  );
});
