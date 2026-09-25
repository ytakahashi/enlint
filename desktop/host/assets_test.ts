import { assertEquals } from "@std/assert";
import { createAssetHandler } from "./assets.ts";

const handle = createAssetHandler({
  html: "<!doctype html>",
  css: "body {}",
  script: "console.log(1);",
});

function get(path: string, method = "GET"): Response {
  return handle(new Request(`http://127.0.0.1:8000${path}`, { method }));
}

Deno.test("asset handler serves the page under a content security policy", async () => {
  const response = get("/");

  assertEquals(response.status, 200);
  assertEquals(await response.text(), "<!doctype html>");
  assertEquals(
    response.headers.get("content-type"),
    "text/html; charset=utf-8",
  );
  assertEquals(
    response.headers.get("content-security-policy"),
    "default-src 'self'",
  );
});

Deno.test("asset handler serves the stylesheet and the bundle", async () => {
  const css = get("/style.css");
  const script = get("/app.js");

  assertEquals(await css.text(), "body {}");
  assertEquals(css.headers.get("content-type"), "text/css; charset=utf-8");
  assertEquals(await script.text(), "console.log(1);");
  assertEquals(
    script.headers.get("content-type"),
    "text/javascript; charset=utf-8",
  );
  assertEquals(script.headers.get("cache-control"), "no-store");
});

Deno.test("asset handler rejects unknown paths and methods", async () => {
  const missing = get("/secrets.txt");
  const post = get("/", "POST");

  assertEquals(missing.status, 404);
  await missing.body?.cancel();
  assertEquals(post.status, 405);
  assertEquals(post.headers.get("allow"), "GET, HEAD");
});
