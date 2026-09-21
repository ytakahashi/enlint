import { assertEquals } from "@std/assert";
import { VERSION } from "./version.ts";

Deno.test("CLI version matches the package version", async () => {
  const config = JSON.parse(
    await Deno.readTextFile(new URL("../deno.json", import.meta.url)),
  );

  assertEquals(VERSION, config.version);
});
