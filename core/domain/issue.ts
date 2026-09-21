export type IssueSeverity = "low" | "medium" | "high";

export type IssueCategory =
  | "wording"
  | "grammar"
  | "clarity"
  | "context"
  | "tone";

/**
 * The evaluator does not return source spans. Sentence targets identify a
 * separately evaluated sentence by index rather than pretending a span exists.
 */
export type IssueTarget =
  | { readonly kind: "message" }
  | { readonly kind: "sentence"; readonly index: number };

export type Issue = {
  readonly category: IssueCategory;
  readonly severity: IssueSeverity;
  readonly target: IssueTarget;
  readonly detail: string;
};
