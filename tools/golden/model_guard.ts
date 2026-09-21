export class JevModelChangedError extends Error {
  override readonly name = "JevModelChangedError";
}

type ModelResponse = { readonly model: string };

/**
 * Fails a run whose responses stop coming from a single model.
 *
 * Pass `expectedModel` when the caller resolved the alias before the run and
 * needs observations keyed to it, as the report does for its checkpoint.
 * Callers that keep nothing across runs omit it, and the first response fixes
 * the model for the rest of the run without spending an extra request.
 */
export function guardJevModel<Options, Response extends ModelResponse>(
  runner: (options: Options) => Promise<Response>,
  expectedModel?: string,
): (options: Options) => Promise<Response> {
  let resolved = expectedModel;

  return async (options) => {
    const response = await runner(options);
    resolved ??= response.model;
    if (response.model !== resolved) {
      throw new JevModelChangedError(
        `Jev model changed during the golden run: expected "${resolved}", ` +
          `received "${response.model}"`,
      );
    }
    return response;
  };
}
