# Repository guidance

enlint is a Deno-based English linter. Treat the implementation and its adjacent
tests as the source of truth for behavior, including boundary cases and output
shapes. Record non-obvious constraints next to the code that enforces them.

## Where to look

- Use `ARCHITECTURE.md` when changing module boundaries, dependencies, public
  Core APIs, or provider adapters.
- Use `tests/README.md` when changing evaluation policy, live provider tests, or
  the golden-corpus workflow.
- Use `deno.json` for tasks, dependencies, permissions, and publishing.

## Verification

After implementation changes, run the default verification suite:

- `deno task fmt:check`
- `deno task lint`
- `deno task check`
- `deno task test`

Do not run provider-backed tasks such as `test:golden`, `golden:report`, or
`test:live*` unless explicitly requested.
