export type JudgementId = "needsFix";

export type JudgementDefinition = {
  readonly id: JudgementId;
  readonly label: string;
  readonly instructions: string;
  readonly criteria: {
    readonly true: string;
    readonly false: string;
  };
};

export type JudgementResult = {
  readonly id: JudgementId;
  /** Model-estimated P(true), not confidence in the selected outcome. */
  readonly probability: number;
  readonly confidence: number | undefined;
};

export const NEEDS_FIX_DEFINITION = {
  id: "needsFix",
  label: "Needs Fix",
  instructions:
    "Decide whether the message has a meaningful problem that the writer should fix before sending it in the provided context.",
  criteria: {
    true:
      "The message contains a material problem in wording, grammar, clarity, context fit, or tone that should be corrected before sending.",
    false:
      "The message is ready to send, even if a minor stylistic improvement could still be made.",
  },
} as const satisfies JudgementDefinition;

export const JUDGEMENT_DEFINITIONS = [
  NEEDS_FIX_DEFINITION,
] as const satisfies readonly JudgementDefinition[];
