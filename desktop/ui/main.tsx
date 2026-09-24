/// <reference lib="dom" />
// Loading the integration makes components that read a signal's value during
// render re-render when it changes.
import "@preact/signals";
import { render } from "preact";
import type { Bindings } from "../protocol/mod.ts";
import { App } from "./components/app.tsx";
import { createBindingsGateway } from "./gateway.ts";
import { createSessionController } from "./state/controller.ts";

// deno desktop injects `bindings`, a proxy to the handlers the host registers.
const { bindings } = globalThis as unknown as { readonly bindings: Bindings };
const controller = createSessionController(createBindingsGateway(bindings));

// Check's shortcut is handled here rather than as a menu accelerator: deno
// desktop does not fire accelerators on Enter, and a document listener also
// receives keys typed into the textarea.
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    void controller.check();
  }
});

const root = document.getElementById("app");
if (root === null) {
  throw new Error("missing #app element");
}
render(<App controller={controller} />, root);
