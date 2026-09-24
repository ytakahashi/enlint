import { diffWordsWithSpace } from "diff";

export type DiffSegment = {
  readonly kind: "equal" | "added" | "removed";
  readonly text: string;
};

/**
 * Word-level differences from `before` to `after`, in display order.
 *
 * Whitespace is kept as its own token so that concatenating the equal and
 * removed segments reproduces `before`, and the equal and added segments
 * reproduce `after`. This is the only module that knows the diff library.
 */
export function computeWordDiff(
  before: string,
  after: string,
): readonly DiffSegment[] {
  return diffWordsWithSpace(before, after).map((change) => ({
    kind: change.added ? "added" : change.removed ? "removed" : "equal",
    text: change.value,
  }));
}
