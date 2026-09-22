import type { EvaluationRequest } from "#core/mod.ts";
import type { JevEvaluationInput, JevQuestion } from "./_types.ts";

export function buildJevInput(
  request: EvaluationRequest,
): JevEvaluationInput {
  const questions: Record<string, JevQuestion> = {};

  for (const metric of request.metrics) {
    addQuestion(questions, metric.id, {
      type: "score",
      instructions: metric.instructions,
      criteria: metric.levels,
    });
  }
  for (const classification of request.classifications) {
    addQuestion(questions, classification.id, {
      type: "choice",
      instructions: classification.instructions,
      criteria: classification.choices,
    });
  }
  for (const judgement of request.judgements) {
    addQuestion(questions, judgement.id, {
      type: "noul",
      instructions: judgement.instructions,
      criteria: judgement.criteria,
    });
  }

  return {
    // Jev evaluates every question against one shared state. Consequently the
    // context can influence every metric, even if only Context Fit names it.
    state:
      `Context: ${request.profile.description}\n\nMessage:\n${request.text}`,
    questions,
  };
}

function addQuestion(
  questions: Record<string, JevQuestion>,
  id: string,
  question: JevQuestion,
): void {
  if (Object.hasOwn(questions, id)) {
    throw new TypeError(`duplicate evaluation question ID "${id}"`);
  }
  questions[id] = question;
}
