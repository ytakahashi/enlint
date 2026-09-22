# enlint

enlint is an English linter for reviewing messages. It scores writing and
reports issues without immediately rewriting the original text, so you can
improve it yourself and see how each change affects the result.

## Installation

```bash
deno install -gf \
  --allow-env=TYPESAFE_API_KEY,OPENAI_*,NODE_OPTIONS,NO_COLOR \
  --allow-net=api.typesafe.ai,api.openai.com \
  jsr:@ytakahashi/enlint
```

`deno install` grants no permissions on its own, so the flags above are part of
the command rather than of the package. They are the complete set enlint needs:
`TYPESAFE_API_KEY` for evaluation, `NO_COLOR` for the color convention, and the
`OPENAI_*` and `NODE_OPTIONS` variables that the OpenAI SDK reads when advice is
requested. Network access is limited to the two provider hosts. `--version` and
`--help` run without any permission at all.

Evaluation requires `TYPESAFE_API_KEY`. `OPENAI_API_KEY` is needed only for
`--explain` and `--fix`; lint runs without it.

```bash
export TYPESAFE_API_KEY=...
enlint --context work "Could you review this today?"
pbpaste | enlint --context email --output json
```

Remove the command with `deno uninstall -g enlint`.

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
