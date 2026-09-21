import type {
  EvaluationOutcome,
  EvaluationRequest,
  Evaluator,
} from "../domain/evaluator.ts";

export class FakeEvaluator implements Evaluator {
  readonly #outcome: EvaluationOutcome;
  readonly #requests: EvaluationRequest[] = [];

  constructor(outcome: EvaluationOutcome) {
    this.#outcome = outcome;
  }

  get requests(): readonly EvaluationRequest[] {
    return this.#requests;
  }

  evaluate(request: EvaluationRequest): Promise<EvaluationOutcome> {
    this.#requests.push(request);
    return Promise.resolve(this.#outcome);
  }
}
