import { assertEquals, assertThrows } from "@std/assert";
import { determineStatus } from "./status.ts";

Deno.test("determineStatus gives needs-fix probability precedence", () => {
  assertEquals(determineStatus(100, 0.5), "needs-revision");
  assertEquals(determineStatus(84, 0.9), "needs-revision");
});

Deno.test("determineStatus applies the ready score boundary", () => {
  assertEquals(determineStatus(85, 0.499), "ready");
  assertEquals(determineStatus(100, 0), "ready");
  assertEquals(determineStatus(84.999, 0.499), "improvable");
});

Deno.test("determineStatus rejects values outside their ranges", () => {
  assertThrows(() => determineStatus(-1, 0), RangeError);
  assertThrows(() => determineStatus(Number.NaN, 0), RangeError);
  assertThrows(() => determineStatus(100, 1.01), RangeError);
  assertThrows(
    () => determineStatus(100, Number.POSITIVE_INFINITY),
    RangeError,
  );
});
