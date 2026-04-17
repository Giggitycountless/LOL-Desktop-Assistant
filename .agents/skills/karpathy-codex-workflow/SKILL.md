---
name: karpathy-codex-workflow
description: Use when coding, reviewing, refactoring, debugging, or planning non-trivial software changes in Codex. Applies four rules: think before coding, prefer the simplest sufficient change, make surgical edits only, and define verifiable success criteria before implementation. Do not use for trivial typo-only or obvious one-line edits unless the user asks for stricter process.
---

# Karpathy-style workflow for Codex

This skill adapts the original Karpathy-inspired coding guidelines to Codex.
Use it to reduce hidden assumptions, overengineering, broad diffs, and vague “done” states.

## Core operating rule

For non-trivial tasks, do not jump straight into editing.
First convert the request into:
1. a concrete interpretation,
2. a minimal change strategy,
3. a verification plan.

If ambiguity remains after reading the repo and surrounding files, surface it explicitly instead of guessing.

---

## 1) Think before coding

**Do not silently choose an interpretation when multiple reasonable readings exist.**

Before making changes:
- State the task in your own words.
- List assumptions that materially affect the implementation.
- If there are multiple plausible directions, present the tradeoffs briefly.
- Push back on approaches that are clearly more complex, risky, or broad than necessary.
- If a missing detail blocks a safe implementation, ask only for that detail.

### Required behavior
- Prefer reading relevant files before proposing architecture changes.
- Prefer checking existing tests, scripts, and patterns before inventing new ones.
- If you are uncertain, say exactly what you are uncertain about.
- Do not pretend confidence you do not have.

### Output pattern for non-trivial tasks
Use this shape before editing:

```md
Interpretation: ...
Assumptions:
- ...
Minimal plan:
1. ...
2. ...
Verification:
- ...
- ...
```

If the task is truly trivial, you may skip the full structure.

---

## 2) Simplicity first

**Write the minimum code that fully solves the user’s request. Nothing speculative.**

Avoid:
- speculative abstractions,
- “future-proofing” not requested by the user,
- new indirection for single-call or single-use logic,
- broad framework changes to solve a local problem,
- large rewrites when a local fix is enough.

### Default choices
- Prefer existing libraries and patterns already used in the repo.
- Prefer direct code over layers of wrappers.
- Prefer one clear function over a micro-abstraction tree.
- Prefer changing configuration only when code changes are not required.

### Self-check
Before finalizing, ask:
- Could this be done with fewer moving parts?
- Did I add anything only because it “might be useful later”?
- Would a senior engineer call this overbuilt?

If yes, simplify before presenting the result.

---

## 3) Surgical changes

**Touch only what is required for the request.**

When editing an existing codebase:
- Do not opportunistically refactor adjacent code.
- Do not reformat unrelated files.
- Do not rename symbols unless required.
- Do not rewrite comments, docs, or tests that are not part of the requested change.
- Match the repository’s existing style unless the user asks for a style cleanup.

### Cleanup rule
You should clean up only the mess created by your own change.
That includes:
- removing imports made unused by your edit,
- removing dead branches created by your edit,
- updating tests that must change because behavior changed.

That does **not** include:
- deleting pre-existing dead code,
- changing unrelated lint issues,
- improving nearby modules “while you are here.”

### Diff test
Every changed line should be explainable as one of:
- necessary to implement the request,
- necessary to verify the request,
- necessary to repair collateral damage caused by your own change.

If not, revert it.

---

## 4) Goal-driven execution

**Define what success looks like before implementation, then verify it.**

Translate vague requests into concrete checks.

Examples:
- “Fix the bug” → add or run a reproduction, then make it pass.
- “Add validation” → add failing invalid-input coverage, then make it pass.
- “Refactor this” → preserve behavior and prove it with tests, type checks, snapshots, or before/after comparisons.
- “Add a feature” → define the expected UX/API behavior and verify it through the narrowest useful checks.

### Verification ladder
Use the smallest reliable verification that proves the change:
1. targeted unit test,
2. targeted integration test,
3. typecheck/lint/build,
4. narrow manual verification,
5. broader suite only when justified.

Prefer targeted checks before expensive repo-wide checks unless repo norms require the full suite.

### Completion standard
Do not say “done” unless you have one of the following:
- executed a relevant automated check,
- verified the exact changed path manually and said what you checked,
- or explicitly stated what could not be verified and why.

When verification is impossible in the current environment, say so plainly.
Do not imply certainty beyond the evidence.

---

## Codex-specific operating notes

Because Codex supports layered `AGENTS.md` instructions and reusable skills:
- Use this skill as a focused workflow overlay for coding tasks.
- Keep always-on repo rules in `AGENTS.md`.
- If a rule from this skill conflicts with a more specific `AGENTS.md`, follow the more specific project instruction.
- If the repository already defines test, lint, review, or release commands, use those instead of inventing new ones.

### Approval and safety boundary
Before any destructive or high-impact action, pause and make the action explicit.
This includes:
- deleting many files,
- force-resetting or rewriting git history,
- adding production dependencies,
- changing deployment or secret-handling behavior,
- running write actions against external systems.

For those actions, ask for approval unless project instructions explicitly say otherwise.

---

## Suggested final response shape

When reporting back after implementation, prefer this structure:

```md
What changed:
- ...

Why this approach:
- ...

Verification:
- Ran ...
- Observed ...

Notes:
- ...
```

Keep it concise. Prefer evidence over reassurance.

---

## Anti-patterns this skill is meant to prevent

Do not:
- guess hidden requirements,
- generate large speculative architectures,
- perform drive-by refactors,
- claim success without verification,
- hide uncertainty,
- change unrelated code because it looks improvable.

If you notice unrelated issues, mention them separately instead of folding them into the patch.
