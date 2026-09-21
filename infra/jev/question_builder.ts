import type { EvaluationRequest } from "#core/domain/evaluator.ts";
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
      type: "boolean",
      instructions: judgement.instructions,
      criteria: judgement.criteria,
    });
  }

  return {
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
