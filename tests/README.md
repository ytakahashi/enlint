# Live tests

This directory contains tests that call external APIs. Keep deterministic unit
and integration tests next to the modules they cover so the default test task
can run without credentials or network access.

## Contract tests

Each provider has its own task so a single provider can be checked on its own,
and so each runs with only the permissions its SDK needs.

| Task                         | Credential         | Verifies                                                                  |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------- |
| `deno task test:live:jev`    | `TYPESAFE_API_KEY` | A live Jev response still matches the recorded fixture contract           |
| `deno task test:live:openai` | `OPENAI_API_KEY`   | A live advice response satisfies the JSON schema the prompt builder sends |
| `deno task test:live`        | both               | Runs both of the above in order                                           |

Both tests print the captured response so fixtures can be refreshed
deliberately. Neither writes fixtures automatically, and neither prints the
credential.

The OpenAI test asserts structure only, never wording: explanation counts match
the lint issues, every issue is explained exactly once, and candidates appear
only when fixes were requested. Those bounds come from the schema the prompt
builder generates, so the test is what proves the provider honors it. Advice
quality is judged in real use, not here.

The Jev adapter supplies all environment-backed SDK options in code, so its task
grants only `TYPESAFE_API_KEY` and network access to `api.typesafe.ai`. The
OpenAI task grants `OPENAI_*` because that SDK owns its environment-based
configuration. Neither task needs system information permissions.

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
It first resolves the configured model alias with one probe request, includes
the resolved model in the checkpoint fingerprint, and rejects a model change
during the run. The gate keeps nothing between runs, so it spends no probe
request and instead adopts the model of its first response; either command fails
rather than mixing observations from two model versions.

The golden test lives in `golden/` next to its corpus so that `test:live` can
run the contract tests without triggering a full corpus evaluation.

### Changing evaluation policy

Rubrics and weights in `core/domain/metric.ts` and thresholds in
`core/application/_thresholds.ts` are the shipped evaluation policy. When one of
them changes, run `deno task golden:report`: use the calibration split to select
a candidate, and adopt it only when the fixed validation split improves over the
current policy. Also run the deterministic test suite for normalization and
exact threshold boundaries. That suite also verifies that the search references
in `tools/golden/tuning.ts` mirror the shipped thresholds; update both locations
rather than changing the assertion when adopting new values.

The report may recommend new weights or thresholds from stored observations, but
it never rewrites production definitions. Live responses and observed scores are
not committed; the corpus, labels, and analysis rules are the reproducible
inputs kept in the repository.
