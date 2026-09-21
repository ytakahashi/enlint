export type JevQuestion =
  | {
    readonly type: "score";
    readonly instructions: string;
    readonly criteria: readonly string[];
  }
  | {
    readonly type: "choice";
    readonly instructions: string;
    readonly criteria: Readonly<Record<string, string>>;
  }
  | {
    readonly type: "noul";
    readonly instructions: string;
    readonly criteria: {
      readonly true: string;
      readonly false: string;
    };
  };

export type JevAnswer =
  | {
    readonly type: "score";
    readonly score: number;
    readonly confidence: number;
    readonly probabilities: Readonly<Record<string, number>>;
  }
  | {
    readonly type: "choice";
    readonly choice: string;
    readonly confidence: number;
    readonly probabilities: Readonly<Record<string, number>>;
  }
  | {
    readonly type: "noul";
    readonly noul: number;
  };

export type JevEvaluationInput = {
  readonly state: string;
  readonly questions: Readonly<Record<string, JevQuestion>>;
};

export type JevEvaluationResponse = {
  readonly answers: Readonly<Record<string, JevAnswer>>;
  readonly model: string;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
};

export type JevEvaluationOptions = JevEvaluationInput & {
  readonly apiKey: string;
  readonly model: string;
  readonly maxRetries: number;
  /** Wall-clock deadline for the whole call, retries included. */
  readonly timeoutMs: number;
};

export type JevEvaluationRunner = (
  options: JevEvaluationOptions,
) => Promise<JevEvaluationResponse>;
