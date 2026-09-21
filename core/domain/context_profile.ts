import type { ToneValue } from "./classification.ts";
import type { MetricId } from "./metric.ts";

export type ContextProfile = {
  readonly id: string;
  readonly label: string;
  /** Evaluation context included in the shared evaluator state. */
  readonly description: string;
  readonly expectedTones: readonly ToneValue[];
  readonly weights?: Partial<Readonly<Record<MetricId, number>>>;
  readonly criteriaOverrides?: Partial<
    Readonly<Record<MetricId, readonly string[]>>
  >;
};

export type BuiltInContextProfileId =
  | "general"
  | "chat"
  | "work"
  | "email"
  | "casual";

export const DEFAULT_CONTEXT_PROFILE_ID =
  "general" satisfies BuiltInContextProfileId;

export const BUILT_IN_CONTEXT_PROFILE_IDS = [
  "general",
  "chat",
  "work",
  "email",
  "casual",
] as const satisfies readonly BuiltInContextProfileId[];

export const BUILT_IN_CONTEXT_PROFILES = {
  general: {
    id: "general",
    label: "General",
    description:
      "A general-purpose message with no specialized audience or convention. Prefer clear, natural English and a broadly appropriate level of formality without assuming a close or professional relationship.",
    expectedTones: ["casual", "neutral", "slightly formal"],
  },
  chat: {
    id: "chat",
    label: "Chat",
    description:
      "A short real-time chat message. Conversational wording, contractions, and some informality are appropriate, while the message should remain easy for the recipient to understand.",
    expectedTones: ["very casual", "casual", "neutral"],
  },
  work: {
    id: "work",
    label: "Work",
    description:
      "A workplace message to colleagues, collaborators, or stakeholders. It should be concise, clear, and professionally courteous without being unnecessarily stiff or ceremonial.",
    expectedTones: ["neutral", "slightly formal", "formal"],
  },
  email: {
    id: "email",
    label: "Email",
    description:
      "An email message whose recipient may not share the writer's immediate context. It should be self-contained, clear, and courteous, with a level of formality suitable for ordinary email correspondence.",
    expectedTones: ["neutral", "slightly formal", "formal"],
  },
  casual: {
    id: "casual",
    label: "Casual",
    description:
      "An informal message to a friend or another familiar person. Relaxed conversational language, contractions, and common shorthand are acceptable as long as the intended meaning remains clear.",
    expectedTones: ["very casual", "casual"],
  },
} as const satisfies Readonly<
  Record<BuiltInContextProfileId, ContextProfile>
>;

export function getBuiltInContextProfile(
  id: string,
): ContextProfile | undefined {
  if (!Object.hasOwn(BUILT_IN_CONTEXT_PROFILES, id)) {
    return undefined;
  }

  return BUILT_IN_CONTEXT_PROFILES[id as BuiltInContextProfileId];
}
