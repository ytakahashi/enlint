# Live tests

This directory contains tests that call external APIs. Keep deterministic unit
and integration tests next to the modules they cover so the default test task
can run without credentials or network access.

Set `AI_GATEWAY_API_KEY`, then run `deno task test:live` to compare a live Jev
response with the recorded fixture contract. The test prints only answers,
rounding, usage, and provider metadata; it never writes or prints the credential
and does not update fixtures automatically.

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
