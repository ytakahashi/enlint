import {
  BUILT_IN_CONTEXT_PROFILE_IDS,
  type BuiltInContextProfileId,
  type IssueSeverity,
  type MetricId,
  TONE_DEFINITION,
  type ToneValue,
} from "#core/mod.ts";

export type GoldenSplit = "calibration" | "validation";
export type GoldenSendability = "ready" | "improvable" | "revise";
export type GoldenSeverity = IssueSeverity | "none";

export type GoldenExpectation = {
  readonly sendability: GoldenSendability;
  readonly focusSeverity: GoldenSeverity;
  readonly acceptableTones: readonly ToneValue[];
};

export type GoldenVariant = {
  readonly text: string;
  readonly expected: GoldenExpectation;
};

export type GoldenPair = {
  readonly id: string;
  readonly context: BuiltInContextProfileId;
  readonly focus: MetricId;
  readonly split: GoldenSplit;
  readonly intent: string;
  readonly better: GoldenVariant;
  readonly worse: GoldenVariant;
};

export type GoldenCorpus = {
  readonly version: 1;
  readonly pairs: readonly GoldenPair[];
};

const METRIC_IDS = [
  "naturalness",
  "grammar",
  "clarity",
  "contextFit",
] as const satisfies readonly MetricId[];
const SPLITS = ["calibration", "validation"] as const;
const SENDABILITIES = ["ready", "improvable", "revise"] as const;
const SEVERITIES = ["none", "low", "medium", "high"] as const;
const TONES = Object.keys(TONE_DEFINITION.choices) as ToneValue[];

export const DEFAULT_GOLDEN_CORPUS_URL = new URL(
  "../../tests/golden/corpus.json",
  import.meta.url,
);

export async function loadGoldenCorpus(
  url: URL = DEFAULT_GOLDEN_CORPUS_URL,
): Promise<GoldenCorpus> {
  const text = await Deno.readTextFile(url);
  const corpus = parseGoldenCorpus(JSON.parse(text));
  validateGoldenCorpusCoverage(corpus);
  return corpus;
}

export function parseGoldenCorpus(value: unknown): GoldenCorpus {
  const root = requireRecord(value, "corpus");
  if (root.version !== 1) {
    throw new TypeError("corpus.version must be 1");
  }
  if (!Array.isArray(root.pairs)) {
    throw new TypeError("corpus.pairs must be an array");
  }

  const pairs = root.pairs.map((pair, index) => parsePair(pair, index));
  const ids = new Set<string>();
  for (const pair of pairs) {
    if (ids.has(pair.id)) {
      throw new TypeError(`duplicate golden pair ID "${pair.id}"`);
    }
    ids.add(pair.id);
  }

  return { version: 1, pairs };
}

export function validateGoldenCorpusCoverage(corpus: GoldenCorpus): void {
  if (corpus.pairs.length < 20 || corpus.pairs.length > 30) {
    throw new RangeError("golden corpus must contain between 20 and 30 pairs");
  }

  for (const id of BUILT_IN_CONTEXT_PROFILE_IDS) {
    if (!corpus.pairs.some((pair) => pair.context === id)) {
      throw new TypeError(`golden corpus does not cover context "${id}"`);
    }
  }
  for (const focus of METRIC_IDS) {
    if (!corpus.pairs.some((pair) => pair.focus === focus)) {
      throw new TypeError(`golden corpus does not cover metric "${focus}"`);
    }
  }
  for (const split of SPLITS) {
    if (!corpus.pairs.some((pair) => pair.split === split)) {
      throw new TypeError(`golden corpus does not contain split "${split}"`);
    }
  }
}

function parsePair(value: unknown, index: number): GoldenPair {
  const path = `corpus.pairs[${index}]`;
  const pair = requireRecord(value, path);
  const id = requireText(pair.id, `${path}.id`);
  const context = requireMember(
    pair.context,
    BUILT_IN_CONTEXT_PROFILE_IDS,
    `${path}.context`,
  );
  const focus = requireMember(pair.focus, METRIC_IDS, `${path}.focus`);
  const split = requireMember(pair.split, SPLITS, `${path}.split`);
  const intent = requireText(pair.intent, `${path}.intent`);
  const better = parseVariant(pair.better, `${path}.better`);
  const worse = parseVariant(pair.worse, `${path}.worse`);

  if (better.text === worse.text) {
    throw new TypeError(`${path} must contain two different messages`);
  }

  return { id, context, focus, split, intent, better, worse };
}

function parseVariant(value: unknown, path: string): GoldenVariant {
  const variant = requireRecord(value, path);
  const expected = requireRecord(variant.expected, `${path}.expected`);
  if (!Array.isArray(expected.acceptableTones)) {
    throw new TypeError(`${path}.expected.acceptableTones must be an array`);
  }

  const acceptableTones = expected.acceptableTones.map((tone, index) =>
    requireMember(
      tone,
      TONES,
      `${path}.expected.acceptableTones[${index}]`,
    )
  );
  if (acceptableTones.length === 0) {
    throw new TypeError(
      `${path}.expected.acceptableTones must not be empty`,
    );
  }
  if (new Set(acceptableTones).size !== acceptableTones.length) {
    throw new TypeError(
      `${path}.expected.acceptableTones must not contain duplicates`,
    );
  }

  return {
    text: requireText(variant.text, `${path}.text`),
    expected: {
      sendability: requireMember(
        expected.sendability,
        SENDABILITIES,
        `${path}.expected.sendability`,
      ),
      focusSeverity: requireMember(
        expected.focusSeverity,
        SEVERITIES,
        `${path}.expected.focusSeverity`,
      ),
      acceptableTones,
    },
  };
}

function requireRecord(
  value: unknown,
  path: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function requireMember<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.some((item) => item === value)) {
    throw new TypeError(`${path} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}
