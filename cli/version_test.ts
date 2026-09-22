import { assertEquals } from "@std/assert";
import { VERSION } from "./version.ts";

// version.ts derives the value through an import attribute, so this no longer
// guards a duplicated literal. It pins the source instead: the constant must
// keep coming from the package manifest rather than from any other file.
Deno.test("CLI version comes from the package manifest", async () => {
  const config = JSON.parse(
    await Deno.readTextFile(new URL("../deno.json", import.meta.url)),
  );

  assertEquals(VERSION, config.version);
});
