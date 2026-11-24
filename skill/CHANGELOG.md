# Changelog

## 1.0.0
- First version: Workflow engine (waves, per-unit sceptic + one fix, gap critic, synthesis), plan validator, planning/merge/worker references.

## 1.1.0
- Sceptic severity rules (must-fix vs should-fix, spot-check instead of redo), cost estimate in launch line, brief states network policy.

## 1.2.0 (shareable release)
- No machine-specific paths: the skill finds its own folder.
- Cost confirmation before every launch, with agent counts printed by the validator.
- Hard agent ceiling (`maxAgents`) and a cap on extra gap units (`maxGapUnits`, default 5).
- A unit can no longer vanish from the results when a stage errors; a failed critic or merge no longer loses the run.
- Strict mode reports when only one of two reviewers returned. A reviewer that fails a unit without a must-fix no longer triggers an empty fix pass.
- Validator rejects malformed plans cleanly and checks unit ids are safe file names.
- Full fallback procedure for sessions without the Workflow tool. Example plan added.
