// `deno install` grants no permissions and ignores the shebang in main.ts, so
// the installed command starts with none. Commands that never evaluate must
// therefore run under an empty grant, which only a real process can show:
// anything the composition root reads eagerly fails before parseArgs is
// reached. Running the entry point as a subprocess reproduces that grant
// without installing, so the check stays out of the live suite.
import { assertEquals, assertStringIncludes } from "@std/assert";
import { VERSION } from "./version.ts";

const REPO_ROOT = new URL("../", import.meta.url);
const decoder = new TextDecoder();

function runWithoutPermissions(
  arg: string,
): Promise<Deno.CommandOutput> {
  return new Deno.Command("deno", {
    // No permission flags: that is the condition under test.
    args: ["run", "--quiet", "--config", "deno.json", "./cli/main.ts", arg],
    cwd: REPO_ROOT,
    stdout: "piped",
    stderr: "piped",
  }).output();
}

Deno.test("--version runs without any permission", async () => {
  const { code, stdout, stderr } = await runWithoutPermissions("--version");

  assertEquals(code, 0, decoder.decode(stderr));
  assertEquals(decoder.decode(stdout), `enlint ${VERSION}\n`);
});

Deno.test("--help runs without any permission", async () => {
  const { code, stdout, stderr } = await runWithoutPermissions("--help");

  assertEquals(code, 0, decoder.decode(stderr));
  assertStringIncludes(decoder.decode(stdout), "Usage: enlint");
});
