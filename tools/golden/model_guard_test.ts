import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { guardJevModel, JevModelChangedError } from "./model_guard.ts";

const RESPONSE = { model: "jev-1.13.0" };
const CHANGED = { model: "jev-1.14.0" };

Deno.test("guardJevModel preserves responses from the expected model", async () => {
  const runner = guardJevModel(
    () => Promise.resolve(RESPONSE),
    RESPONSE.model,
  );

  assertStrictEquals(await runner({}), RESPONSE);
});

Deno.test("guardJevModel rejects a model change during a golden run", async () => {
  const runner = guardJevModel(
    () => Promise.resolve(CHANGED),
    RESPONSE.model,
  );

  const error = await assertRejects(
    () => runner({}),
    JevModelChangedError,
    'expected "jev-1.13.0", received "jev-1.14.0"',
  );
  assertEquals(error.name, "JevModelChangedError");
});

Deno.test("guardJevModel adopts the first response when no model is expected", async () => {
  const responses = [RESPONSE, RESPONSE, CHANGED];
  let index = 0;
  const runner = guardJevModel(() => Promise.resolve(responses[index++]));

  assertStrictEquals(await runner({}), RESPONSE);
  assertStrictEquals(await runner({}), RESPONSE);
  await assertRejects(
    () => runner({}),
    JevModelChangedError,
    'expected "jev-1.13.0", received "jev-1.14.0"',
  );
});
