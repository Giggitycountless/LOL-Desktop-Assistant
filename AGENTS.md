# Codex working agreements

Use the `karpathy-codex-workflow` skill for non-trivial coding, debugging, refactoring, or review tasks.

## Default expectations
- Think before editing: state interpretation, assumptions, minimal plan, and verification for non-trivial work.
- Prefer the simplest sufficient implementation.
- Make surgical changes only; avoid unrelated refactors.
- Verify changes with the narrowest meaningful checks before claiming completion.
- Be explicit about uncertainty, blocked verification, or risky tradeoffs.

## Approval boundary
Ask before:
- deleting or rewriting many files,
- force git operations,
- changing deployment behavior,
- adding production dependencies,
- performing writes against external systems.

## Reporting
Summarize:
- what changed,
- why this approach was chosen,
- what verification ran,
- any remaining caveats.
