# Live tests

This directory contains tests that call external APIs. Keep deterministic unit
and integration tests next to the modules they cover so the default test task
can run without credentials or network access.

Set `AI_GATEWAY_API_KEY`, then run `deno task test:live` to compare a live Jev
response with the recorded fixture contract. The test prints only answers,
rounding, usage, and provider metadata; it never writes or prints the credential
and does not update fixtures automatically.
