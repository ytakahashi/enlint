import { assertEquals, assertStringIncludes } from "@std/assert";
import { errorMessage } from "./messages.ts";

Deno.test("errorMessage names the credential to configure", () => {
  assertStringIncludes(
    errorMessage({ kind: "missing-credentials", provider: "jev" }),
    "TYPESAFE_API_KEY",
  );
  assertStringIncludes(
    errorMessage({ kind: "missing-credentials", provider: "openai" }),
    "OPENAI_API_KEY",
  );
});

Deno.test("errorMessage attributes provider failures to their service", () => {
  assertEquals(
    errorMessage({ kind: "timeout", provider: "jev" }),
    "The evaluation service did not respond in time.",
  );
  assertEquals(
    errorMessage({ kind: "timeout", provider: "openai" }),
    "The advice service did not respond in time.",
  );
});

Deno.test("errorMessage words failures that belong to no provider", () => {
  assertEquals(
    errorMessage({ kind: "clipboard" }),
    "Could not copy to the clipboard.",
  );
  assertEquals(
    errorMessage({ kind: "unexpected" }),
    "Something went wrong. Try again.",
  );
});
