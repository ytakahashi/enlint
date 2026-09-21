import { assertEquals, assertNotEquals } from "@std/assert";
import { fingerprintGoldenRun } from "./checkpoint.ts";

Deno.test("fingerprintGoldenRun is stable and detects configuration changes", async () => {
  const first = await fingerprintGoldenRun({ corpus: ["a"], repeats: 3 });
  const same = await fingerprintGoldenRun({ corpus: ["a"], repeats: 3 });
  const changed = await fingerprintGoldenRun({ corpus: ["a"], repeats: 1 });

  assertEquals(first, same);
  assertNotEquals(first, changed);
});
