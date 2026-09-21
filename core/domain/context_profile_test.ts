import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { TONE_DEFINITION } from "./classification.ts";
import {
  BUILT_IN_CONTEXT_PROFILE_IDS,
  BUILT_IN_CONTEXT_PROFILES,
  DEFAULT_CONTEXT_PROFILE_ID,
  getBuiltInContextProfile,
} from "./context_profile.ts";

Deno.test("built-in context profiles expose the stable default and order", () => {
  assertEquals(DEFAULT_CONTEXT_PROFILE_ID, "general");
  assertEquals(BUILT_IN_CONTEXT_PROFILE_IDS, [
    "general",
    "chat",
    "work",
    "email",
    "casual",
  ]);
  assertEquals(Object.keys(BUILT_IN_CONTEXT_PROFILES), [
    ...BUILT_IN_CONTEXT_PROFILE_IDS,
  ]);
});

Deno.test("built-in context profiles contain valid evaluation data", () => {
  const tones = new Set(Object.keys(TONE_DEFINITION.choices));

  for (const id of BUILT_IN_CONTEXT_PROFILE_IDS) {
    const profile = BUILT_IN_CONTEXT_PROFILES[id];

    assertEquals(profile.id, id);
    assert(profile.label.trim().length > 0);
    assert(profile.description.trim().length > 0);
    assert(profile.expectedTones.length > 0);
    assert(profile.expectedTones.every((tone) => tones.has(tone)));
  }
});

Deno.test("built-in context profile lookup rejects unknown IDs", () => {
  assertStrictEquals(
    getBuiltInContextProfile("work"),
    BUILT_IN_CONTEXT_PROFILES.work,
  );
  assertEquals(getBuiltInContextProfile("unknown"), undefined);
  assertEquals(getBuiltInContextProfile("toString"), undefined);
});
