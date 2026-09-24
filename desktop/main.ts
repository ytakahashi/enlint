/// <reference lib="deno.desktop" />
// Composition root of the desktop app, built with `deno task desktop:build`.

import { JevEvaluator } from "#infra/jev/jev_evaluator.ts";
import { OpenAiAdvisor } from "#infra/llm/openai_advisor.ts";
import { createAssetHandler } from "./host/assets.ts";
import { createCredentialResolver } from "./host/credentials.ts";
import { createHandlers } from "./host/handlers.ts";
import type { Bindings } from "./protocol/mod.ts";
// The host serves the UI without depending on it: this module, which wires
// every area together, loads the files as text and hands them to the asset
// handler. Loading them as text also embeds them in the app, so it needs no
// read permission. The bundle is produced by `deno task desktop:bundle`.
import html from "./ui/index.html" with { type: "text" };
import css from "./ui/style.css" with { type: "text" };
import script from "./_dist/app.js" with { type: "text" };

const decoder = new TextDecoder();

if (import.meta.main) {
  const handlers = createHandlers({
    resolveCredential: createCredentialResolver({
      getEnv: (name) => Deno.env.get(name),
      runCommand: async (program, args) => {
        const output = await new Deno.Command(program, {
          args: [...args],
          stdout: "piped",
          stderr: "null",
        }).output();
        return { code: output.code, stdout: decoder.decode(output.stdout) };
      },
    }),
    createEvaluator: (apiKey) => new JevEvaluator({ apiKey }),
    createAdvisor: (apiKey) => new OpenAiAdvisor({ apiKey }),
    // The runtime-side Clipboard API (Deno 2.9.6+), not the webview's, so
    // copying does not depend on the webview's secure-context rules.
    clipboard: { writeText: (text) => navigator.clipboard.writeText(text) },
    reportError: (error) => console.error(error),
  });

  // deno desktop binds this to the address the webview opens; no port is set.
  Deno.serve(createAssetHandler({ html, css, script }));

  const window = new Deno.BrowserWindow<Bindings>({
    title: "enlint",
    width: 1100,
    height: 760,
  });
  window.bind("lint", handlers.lint);
  window.bind("advise", handlers.advise);
  window.bind("copyText", handlers.copyText);

  // macOS delivers the standard editing shortcuts to the webview through Edit
  // menu roles; without them Cmd+C, Cmd+V, and Cmd+Z do nothing in the text
  // area.
  window.setApplicationMenu([
    { submenu: { label: "enlint", items: [{ role: { role: "quit" } }] } },
    {
      submenu: {
        label: "Edit",
        items: [
          { role: { role: "undo" } },
          { role: { role: "redo" } },
          "separator",
          { role: { role: "cut" } },
          { role: { role: "copy" } },
          { role: { role: "paste" } },
          { role: { role: "selectAll" } },
        ],
      },
    },
    {
      submenu: {
        label: "View",
        // No accelerator: an accidental reload would discard the text.
        items: [{ item: { label: "Reload", id: "reload", enabled: true } }],
      },
    },
  ]);
  window.addEventListener("menuclick", (event) => {
    if (event.detail.id === "reload") window.reload();
  });
}
