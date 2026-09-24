import {
  BUILT_IN_CONTEXT_PROFILE_IDS,
  BUILT_IN_CONTEXT_PROFILES,
} from "#core/mod.ts";
import type { SessionController } from "../state/controller.ts";
import { canCheck } from "../state/session.ts";

export function Editor(
  { controller }: { readonly controller: SessionController },
) {
  const session = controller.session.value;
  const { options } = session;
  const running = session.check.phase === "linting" ||
    session.check.phase === "advising";

  return (
    <section class="editor">
      <textarea
        value={session.text}
        placeholder="Write or paste an English message, then press Check."
        // The linter is the reviewer here; the webview's own spell check would
        // compete with it.
        spellcheck={false}
        autofocus
        onInput={(event) => controller.setText(event.currentTarget.value)}
      />
      <div class="controls">
        <label>
          Context{" "}
          <select
            value={session.contextId}
            onChange={(event) =>
              controller.setContextId(event.currentTarget.value)}
          >
            {BUILT_IN_CONTEXT_PROFILE_IDS.map((id) => (
              <option key={id} value={id}>
                {BUILT_IN_CONTEXT_PROFILES[id].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.explain}
            onChange={(event) =>
              controller.setOptions({
                ...options,
                explain: event.currentTarget.checked,
              })}
          />{" "}
          Explain
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.fix}
            onChange={(event) =>
              controller.setOptions({
                ...options,
                fix: event.currentTarget.checked,
              })}
          />{" "}
          Fix
        </label>
        <span class="spacer" />
        {session.textBeforeApply !== undefined && (
          <button
            type="button"
            onClick={() => controller.undoApply()}
          >
            Undo apply
          </button>
        )}
        <button
          type="button"
          class="primary"
          disabled={!canCheck(session)}
          onClick={() => void controller.check()}
        >
          {running ? "Checking…" : "Check"} <kbd>⌘↵</kbd>
        </button>
      </div>
    </section>
  );
}
