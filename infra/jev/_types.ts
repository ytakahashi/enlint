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
    readonly type: "boolean";
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
    readonly probabilities?: Readonly<Record<string, number>>;
  }
  | {
    readonly type: "choice";
    readonly choice: string;
    readonly probabilities?: Readonly<Record<string, number>>;
  }
  | {
    readonly type: "boolean";
    readonly probability: number;
  };

export type JevEvaluationInput = {
  readonly state: string;
  readonly questions: Readonly<Record<string, JevQuestion>>;
};

export type JevEvaluationResponse = {
  readonly answers: Readonly<Record<string, JevAnswer>>;
  readonly rounding?: {
    readonly probabilityDecimals?: number;
    readonly scoreDecimals?: number;
  };
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  };
  readonly providerMetadata?: Readonly<Record<string, unknown>>;
};

export type JevEvaluationOptions = JevEvaluationInput & {
  readonly model: string;
  readonly maxRetries: number;
  /** Wall-clock deadline for the whole call, retries included. */
  readonly timeoutMs: number;
};

export type JevEvaluationRunner = (
  options: JevEvaluationOptions,
) => Promise<JevEvaluationResponse>;
