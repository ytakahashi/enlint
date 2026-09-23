import { assertEquals, assertRejects } from "@std/assert";
import {
  type CommandOutput,
  createCredentialResolver,
  CredentialLookupError,
} from "./credentials.ts";

type Call = { readonly program: string; readonly args: readonly string[] };

function resolverWith(
  env: Readonly<Record<string, string>>,
  output: CommandOutput,
) {
  const calls: Call[] = [];
  const resolve = createCredentialResolver({
    getEnv: (name) => env[name],
    runCommand: (program, args) => {
      calls.push({ program, args });
      return Promise.resolve(output);
    },
  });
  return { resolve, calls };
}

Deno.test("credential resolver prefers the environment over the Keychain", async () => {
  const { resolve, calls } = resolverWith(
    { TYPESAFE_API_KEY: "from-env" },
    { code: 0, stdout: "from-keychain\n" },
  );

  assertEquals(await resolve("TYPESAFE_API_KEY"), "from-env");
  assertEquals(calls, []);
});

Deno.test("credential resolver reads the Keychain item named after the variable", async () => {
  const { resolve, calls } = resolverWith(
    {},
    { code: 0, stdout: "from-keychain\n" },
  );

  assertEquals(await resolve("OPENAI_API_KEY"), "from-keychain");
  assertEquals(calls, [{
    program: "/usr/bin/security",
    args: [
      "find-generic-password",
      "-s",
      "enlint",
      "-a",
      "OPENAI_API_KEY",
      "-w",
    ],
  }]);
});

Deno.test("credential resolver treats blank values as not configured", async () => {
  const { resolve, calls } = resolverWith(
    { TYPESAFE_API_KEY: "  " },
    { code: 0, stdout: "\n" },
  );

  assertEquals(await resolve("TYPESAFE_API_KEY"), undefined);
  assertEquals(calls.length, 1);
});

Deno.test("credential resolver reports a missing Keychain item as not configured", async () => {
  const { resolve } = resolverWith({}, { code: 44, stdout: "" });

  assertEquals(await resolve("TYPESAFE_API_KEY"), undefined);
});

Deno.test("credential resolver rejects other Keychain failures", async () => {
  const { resolve } = resolverWith({}, { code: 51, stdout: "" });

  await assertRejects(
    () => resolve("TYPESAFE_API_KEY"),
    CredentialLookupError,
    "exited with status 51",
  );
});
