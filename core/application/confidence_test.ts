import { assertEquals } from "@std/assert";
import { isLowConfidence } from "./confidence.ts";

Deno.test("isLowConfidence flags only values below the cutoff", () => {
  assertEquals(isLowConfidence(0), true);
  assertEquals(isLowConfidence(0.39), true);
  assertEquals(isLowConfidence(0.4), false);
  assertEquals(isLowConfidence(1), false);
});

Deno.test("isLowConfidence treats a missing confidence as not low", () => {
  assertEquals(isLowConfidence(undefined), false);
});
