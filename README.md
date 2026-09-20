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

## License

[MIT](./LICENSE)
