export type TextWriter = {
  readonly write: (text: string) => Promise<void>;
};
