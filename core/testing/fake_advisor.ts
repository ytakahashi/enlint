import type {
  AdviceOutcome,
  AdviceRequest,
  Advisor,
} from "../domain/advisor.ts";

export type FakeAdvisorResponse =
  | { readonly outcome: AdviceOutcome }
  | { readonly error: Error };

export class FakeAdvisor implements Advisor {
  readonly #response: FakeAdvisorResponse;
  readonly #requests: AdviceRequest[] = [];

  constructor(response: FakeAdvisorResponse) {
    this.#response = response;
  }

  get requests(): readonly AdviceRequest[] {
    return this.#requests;
  }

  advise(request: AdviceRequest): Promise<AdviceOutcome> {
    this.#requests.push(request);
    if ("error" in this.#response) {
      return Promise.reject(this.#response.error);
    }
    return Promise.resolve(this.#response.outcome);
  }
}
