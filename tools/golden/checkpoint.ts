import type { GoldenObservation } from "./analysis.ts";

type GoldenCheckpoint = {
  readonly version: 1;
  readonly fingerprint: string;
  readonly observations: readonly GoldenObservation[];
};

const CHECKPOINT_DIRECTORY_URL = new URL("../../.enlint/", import.meta.url);
export const GOLDEN_CHECKPOINT_URL = new URL(
  "golden-report-checkpoint.json",
  CHECKPOINT_DIRECTORY_URL,
);
const TEMPORARY_CHECKPOINT_URL = new URL(
  "golden-report-checkpoint.tmp",
  CHECKPOINT_DIRECTORY_URL,
);

export async function fingerprintGoldenRun(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function loadGoldenCheckpoint(
  fingerprint: string,
): Promise<readonly GoldenObservation[]> {
  let text: string;
  try {
    text = await Deno.readTextFile(GOLDEN_CHECKPOINT_URL);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return [];
    }
    throw error;
  }

  const checkpoint = parseCheckpoint(JSON.parse(text));
  return checkpoint.fingerprint === fingerprint ? checkpoint.observations : [];
}

export async function saveGoldenCheckpoint(
  fingerprint: string,
  observations: readonly GoldenObservation[],
): Promise<void> {
  const checkpoint: GoldenCheckpoint = {
    version: 1,
    fingerprint,
    observations,
  };
  await Deno.mkdir(CHECKPOINT_DIRECTORY_URL, { recursive: true });
  await Deno.writeTextFile(
    TEMPORARY_CHECKPOINT_URL,
    `${JSON.stringify(checkpoint, null, 2)}\n`,
  );
  await Deno.rename(TEMPORARY_CHECKPOINT_URL, GOLDEN_CHECKPOINT_URL);
}

export async function clearGoldenCheckpoint(): Promise<void> {
  try {
    await Deno.remove(GOLDEN_CHECKPOINT_URL);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

function parseCheckpoint(value: unknown): GoldenCheckpoint {
  if (!isRecord(value) || value.version !== 1) {
    throw new TypeError("golden checkpoint must have version 1");
  }
  if (typeof value.fingerprint !== "string") {
    throw new TypeError("golden checkpoint fingerprint must be a string");
  }
  if (
    !Array.isArray(value.observations) ||
    !value.observations.every(isObservation)
  ) {
    throw new TypeError("golden checkpoint contains invalid observations");
  }
  return value as GoldenCheckpoint;
}

function isObservation(value: unknown): value is GoldenObservation {
  if (!isRecord(value) || !isRecord(value.metricScores)) {
    return false;
  }
  const metricScores = value.metricScores;
  return typeof value.pairId === "string" &&
    (value.variant === "better" || value.variant === "worse") &&
    Number.isInteger(value.run) && Number(value.run) >= 0 &&
    isFiniteNumber(value.overallScore) &&
    ["naturalness", "grammar", "clarity", "contextFit"].every((id) =>
      isFiniteNumber(metricScores[id])
    ) &&
    isFiniteNumber(value.needsFixProbability) &&
    typeof value.tone === "string" && typeof value.status === "string" &&
    typeof value.focusSeverity === "string" &&
    typeof value.highestIssueSeverity === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
