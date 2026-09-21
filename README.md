# enlint

enlint is an English linter for reviewing messages. It scores writing and
reports issues without immediately rewriting the original text, so you can
improve it yourself and see how each change affects the result.

## Evaluation

enlint will evaluate complete messages rather than isolated sentences. The
initial evaluation covers:

- Naturalness
- Grammar
- Clarity
- Context fit
- Tone classification

The overall score is calculated deterministically from the individual metrics.
Evaluation results will be available as human-readable text or structured JSON.

## Development

Deno 2.9.5 is the currently tested runtime version.

```bash
deno task fmt:check
deno task lint
deno task check
deno task test
```

Tests that call external APIs are kept separate:

```bash
deno task test:live
```

The golden corpus quality gate and its calibration report can also be run
independently. Both require `AI_GATEWAY_API_KEY`; repeat count and concurrency
default to 3 and 4 and can be changed with `ENLINT_GOLDEN_REPEATS` and
`ENLINT_GOLDEN_CONCURRENCY`. Request starts are spaced 2.1 seconds apart by
default to avoid model rate limits; `ENLINT_GOLDEN_INTERVAL_MS` changes that
interval. The per-request deadline defaults to 120 seconds and can be changed
with `ENLINT_GOLDEN_TIMEOUT_MS`.

```bash
deno task test:golden
deno task golden:report
```

The report checkpoints each completed request under `.enlint/`. An interrupted
run resumes automatically when its corpus and evaluation definitions have not
changed, and removes the checkpoint after a successful report.

## License

[MIT](./LICENSE)
