import { assertEquals, assertRejects } from "@std/assert";
import { CliInputError, CliUsageError } from "./errors.ts";
import { resolveInput } from "./input.ts";

Deno.test("resolveInput gives the message argument precedence", async () => {
  let reads = 0;
  const result = await resolveInput("Argument input", {
    isTerminal: () => false,
    readText: () => {
      reads++;
      return Promise.resolve("stdin input");
    },
  });

  assertEquals(result, "Argument input");
  assertEquals(reads, 0);
});

Deno.test("resolveInput reads piped text and removes one final line ending", async () => {
  assertEquals(
    await resolveInput(undefined, {
      isTerminal: () => false,
      readText: () => Promise.resolve("First line\nSecond line\r\n"),
    }),
    "First line\nSecond line",
  );
  assertEquals(
    await resolveInput(undefined, {
      isTerminal: () => false,
      readText: () => Promise.resolve("Message\n\n"),
    }),
    "Message\n",
  );
});

Deno.test("resolveInput reports a missing interactive input", async () => {
  const error = await assertRejects(
    () =>
      resolveInput(undefined, {
        isTerminal: () => true,
        readText: () => Promise.resolve("unreachable"),
      }),
    CliUsageError,
  );
  assertEquals(error.showHelp, true);
});

Deno.test("resolveInput rejects empty piped input", async () => {
  for (const input of ["", "\n", "  \t\r\n"]) {
    await assertRejects(
      () =>
        resolveInput(undefined, {
          isTerminal: () => false,
          readText: () => Promise.resolve(input),
        }),
      CliInputError,
    );
  }
});
