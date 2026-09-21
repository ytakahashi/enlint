# Live tests

This directory contains tests that call external APIs. Keep deterministic unit
and integration tests next to the modules they cover so the default test task
can run without credentials or network access.

## Contract tests

Each provider has its own task so a single provider can be checked on its own,
and so each runs with only the permissions its SDK needs.

| Task                         | Credential           | Verifies                                                                  |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------- |
| `deno task test:live:jev`    | `AI_GATEWAY_API_KEY` | A live Jev response still matches the recorded fixture contract           |
| `deno task test:live:openai` | `OPENAI_API_KEY`     | A live advice response satisfies the JSON schema the prompt builder sends |
| `deno task test:live`        | both                 | Runs both of the above in order                                           |

Both tests print the captured response so fixtures can be refreshed
deliberately. Neither writes fixtures automatically, and neither prints the
credential.

The OpenAI test asserts structure only, never wording: explanation counts match
the lint issues, every issue is explained exactly once, and candidates appear
only when fixes were requested. Those bounds come from the schema the prompt
builder generates, so the test is what proves the provider honors it. Advice
quality is judged in real use, not here.

Both SDKs read several environment variables of their own, so the tasks grant
them by prefix (`VERCEL_*`, `OPENAI_*`) rather than by name. Listing each name
breaks at runtime whenever an SDK release reads one more, while a prefix still
keeps the grant scoped to that provider: `OPENAI_*` matches `OPENAI_BASE_URL`
but not `OPENAIX_EVIL` or unrelated variables.

The Jev task additionally needs `--allow-sys=hostname` and the `VERCEL_*`
deployment variables because the AI Gateway client reads them. The OpenAI task
needs neither; it reads only `OPENAI_*`.

## Golden corpus

`deno task test:golden` runs only the golden corpus validation split. Each
message is evaluated three times by default, and the median scores must rank the
better version above the worse version both overall and on the pair's focus
metric. `deno task golden:report` evaluates the complete corpus and prints
calibration and validation quality, weight and threshold candidates, and
confidence distributions. Neither command records live responses in the
repository. Golden evaluations use a 120-second per-request deadline and a
2.1-second request-start interval by default. Set `ENLINT_GOLDEN_TIMEOUT_MS` or
`ENLINT_GOLDEN_INTERVAL_MS` to override them. The report command checkpoints
completed requests under `.enlint/` and resumes an interrupted compatible run.

The golden test lives in `golden/` next to its corpus so that `test:live` can
run the contract tests without triggering a full corpus evaluation.
