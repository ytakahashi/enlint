import { assertEquals, assertNotEquals } from "@std/assert";
import { fingerprintGoldenRun } from "./checkpoint.ts";

Deno.test("fingerprintGoldenRun is stable and detects configuration changes", async () => {
  const first = await fingerprintGoldenRun({
    model: { requested: "jev-latest", resolved: "jev-1.13.0" },
    corpus: ["a"],
    repeats: 3,
  });
  const same = await fingerprintGoldenRun({
    model: { requested: "jev-latest", resolved: "jev-1.13.0" },
    corpus: ["a"],
    repeats: 3,
  });
  const changedConfiguration = await fingerprintGoldenRun({
    model: { requested: "jev-latest", resolved: "jev-1.13.0" },
    corpus: ["a"],
    repeats: 1,
  });
  const changedResolvedModel = await fingerprintGoldenRun({
    model: { requested: "jev-latest", resolved: "jev-1.14.0" },
    corpus: ["a"],
    repeats: 3,
  });

  assertEquals(first, same);
  assertNotEquals(first, changedConfiguration);
  assertNotEquals(first, changedResolvedModel);
});
