# enlint

[![GitHub release](https://img.shields.io/github/release/ytakahashi/enlint.svg)](https://github.com/ytakahashi/enlint/releases/)
[![JSR](https://jsr.io/badges/@ytakahashi/enlint)](https://jsr.io/@ytakahashi/enlint)
[![CI](https://github.com/ytakahashi/enlint/actions/workflows/deno.yml/badge.svg)](https://github.com/ytakahashi/enlint/actions/workflows/deno.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

enlint is an English linter for reviewing messages. It scores writing and
reports issues without immediately rewriting the original text, so you can
improve it yourself and see how each change affects the result.

## Installation

```bash
deno install -gf \
  --allow-env=TYPESAFE_API_KEY,OPENAI_API_KEY,NO_COLOR \
  --deny-env=OPENAI_CUSTOM_HEADERS \
  --allow-net=api.typesafe.ai,api.openai.com \
  jsr:@ytakahashi/enlint
```

### Requirements

- Deno
- [TypeSafe AI](https://typesafe.ai/) API Key
- [OpenAI](https://openai.com/api/) API Key (for explaining/fixing)

Evaluation requires `TYPESAFE_API_KEY`. `OPENAI_API_KEY` is needed only for
`--explain` and `--fix`; lint runs without it.

### Notes

- The OpenAI SDK always reads `OPENAI_CUSTOM_HEADERS`. `--deny-env` makes that
  read fail silently instead of prompting, and keeps the environment from
  injecting request headers.
- Within 24 hours of a release, `deno install` refuses the new version under its
  minimum dependency age policy. Add `--min-dep-age=0` to install it right away,
  or wait out the window.

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

## Desktop app

A macOS desktop app offers the same lint, explanations, and rewrite candidates
in one window: write or paste a message, press Check (⌘↵), and apply or copy a
candidate. It is built locally from this repository and is not published.

Apps started from Finder or the Dock do not see shell exports, so the app reads
its API keys from the environment first and then from the macOS Keychain.
Register them once per machine; `-w` without a value prompts for it, so the key
stays out of the shell history.

```bash
security add-generic-password -s enlint -a TYPESAFE_API_KEY -w
security add-generic-password -s enlint -a OPENAI_API_KEY -w
```

Build the app and open it:

```bash
deno task desktop:build
open dist/enlint.app
```

`deno task desktop:dev` runs the app from source with hot reload for the Deno
side. Changes to the UI need `deno task desktop:bundle` and View > Reload.

## Development

Deno 2.9.7 is the currently tested runtime version.

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

Tests that call external APIs are kept separate, one task per provider. For
details, see [tests/README.md](tests/README.md).

## License

[MIT](./LICENSE)
