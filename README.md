# enlint

enlint is an English linter for reviewing messages. It scores writing and
reports issues without immediately rewriting the original text, so you can
improve it yourself and see how each change affects the result.

## Evaluation

enlint evaluates complete messages rather than isolated sentences. It covers:

- Naturalness
- Grammar
- Clarity
- Context fit
- Tone classification

The overall score is calculated deterministically from the individual metrics.
Evaluation results are available as human-readable text or versioned structured
JSON. Use `--explain` or `--fix` to request optional explanations or rewrite
candidates without changing the lint score.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for cross-cutting boundaries and
dependency rules.

## Development

Deno 2.9.5 is the currently tested runtime version.

```bash
deno task fmt:check
deno task lint
deno task check
deno task test
```

`deno task cli` runs the command against the real services, forwarding any
arguments. It needs `TYPESAFE_API_KEY`, and `OPENAI_API_KEY` as well when advice
is requested.

```bash
deno task cli --help
deno task cli --context work --explain --fix "Could you review this today?"
echo "I'll check it later." | deno task cli --context chat --output json
```

The task exists so that the permission list does not have to be typed. The Jev
adapter passes every environment-backed SDK option explicitly, so it only needs
access to `TYPESAFE_API_KEY` and network access to `api.typesafe.ai`. OpenAI
advice retains access to `OPENAI_*` and `api.openai.com`.

Tests that call external APIs are kept separate, one task per provider. For
details, see [tests/README.md](tests/README.md).

## License

[MIT](./LICENSE)
