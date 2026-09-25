/** The UI files the webview loads, as text. */
export type UiAssets = {
  readonly html: string;
  readonly css: string;
  readonly script: string;
};

// The page renders text written by an LLM. Preact escapes it, and the policy
// is a second layer: only the host's own files may load or run. Inline
// <style> and <script> are blocked too, so the UI must keep them in files.
const CONTENT_SECURITY_POLICY = "default-src 'self'";

/**
 * Serves the UI. The files are injected rather than read here, so the host
 * never depends on the UI's sources or its bundle.
 */
export function createAssetHandler(
  assets: UiAssets,
): (request: Request) => Response {
  return (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    switch (new URL(request.url).pathname) {
      case "/":
        return respond(assets.html, "text/html; charset=utf-8", {
          "content-security-policy": CONTENT_SECURITY_POLICY,
        });
      case "/style.css":
        return respond(assets.css, "text/css; charset=utf-8");
      case "/app.js":
        return respond(assets.script, "text/javascript; charset=utf-8");
      default:
        return new Response("Not Found", { status: 404 });
    }
  };
}

function respond(
  body: string,
  contentType: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      // The files are embedded in the binary; a reload must never show a
      // version cached from an earlier build.
      "cache-control": "no-store",
      ...headers,
    },
  });
}
