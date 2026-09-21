export const ADVICE_SCHEMA_NAME = "enlint_advice";
export const MAX_REWRITE_CANDIDATES = 3;

export type OpenAiInputMessage = {
  readonly role: "system" | "user";
  readonly content: string;
};

export type OpenAiAdviceRequestBody = {
  readonly input: readonly OpenAiInputMessage[];
  readonly text: {
    readonly format: {
      readonly type: "json_schema";
      readonly name: typeof ADVICE_SCHEMA_NAME;
      readonly strict: true;
      readonly schema: Readonly<Record<string, unknown>>;
    };
  };
  /** User messages may contain private workplace text, so storage is opt-out. */
  readonly store: false;
};

export type OpenAiAdviceCall = {
  readonly model: string;
  readonly body: OpenAiAdviceRequestBody;
  readonly timeoutMs: number;
  readonly maxRetries: number;
};

/** Minimal SDK response projection consumed by the adapter. */
export type OpenAiAdviceResponse = {
  readonly status: string;
  readonly outputText: string;
  readonly refusal?: string;
  readonly incompleteReason?: string;
};

export type OpenAiAdviceRunner = (
  call: OpenAiAdviceCall,
) => Promise<OpenAiAdviceResponse>;
