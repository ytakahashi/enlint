import type { SessionController } from "../state/controller.ts";
import { Editor } from "./editor.tsx";
import { Results } from "./results.tsx";

/**
 * Components only render the session and forward input to the controller;
 * every decision lives in ui/state, where it is tested without a DOM.
 */
export function App(
  { controller }: { readonly controller: SessionController },
) {
  return (
    <>
      <Editor controller={controller} />
      <Results controller={controller} />
    </>
  );
}
