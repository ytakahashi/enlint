import type { RewriteCandidate } from "#core/mod.ts";
import { useState } from "preact/hooks";
import { computeWordDiff } from "../diff.ts";
import { errorMessage } from "../messages.ts";
import type { SessionController } from "../state/controller.ts";

type CopyState = "idle" | "copied" | { readonly error: string };

export function Candidate(
  { controller, original, candidate, stale }: {
    readonly controller: SessionController;
    /** The text the candidate rewrites, from the lint result. */
    readonly original: string;
    readonly candidate: RewriteCandidate;
    readonly stale: boolean;
  },
) {
  const [copy, setCopy] = useState<CopyState>("idle");

  const copyCandidate = async () => {
    const result = await controller.copyCandidate(candidate.text);
    if (result === undefined) return;
    setCopy(result.ok ? "copied" : { error: errorMessage(result.error) });
  };

  return (
    <div class="candidate">
      <div class="diff">
        {computeWordDiff(original, candidate.text).map((segment, index) => (
          <span key={index} class={segment.kind}>{segment.text}</span>
        ))}
      </div>
      <p class="rationale">{candidate.rationale}</p>
      <div class="actions">
        <button
          type="button"
          disabled={stale}
          onClick={() => controller.apply(candidate.text)}
        >
          Apply
        </button>
        <button
          type="button"
          disabled={stale}
          onClick={() => void copyCandidate()}
        >
          Copy
        </button>
        {copy === "copied" && <span class="pending">Copied</span>}
        {typeof copy === "object" && <span class="error">{copy.error}</span>}
      </div>
    </div>
  );
}
