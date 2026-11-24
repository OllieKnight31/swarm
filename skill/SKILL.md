---
name: swarm
version: 1.2.0
description: >
  Parallel multi-agent executor. Takes any job (research, build, content, audit, migration, bulk
  edits), splits it into independent units, runs them as parallel waves of subagents through the
  Workflow tool, has a fresh sceptic verify every unit (one fix attempt on failure), runs a
  completeness critic to fill gaps, then merges everything into one deliverable and a short briefing.
  Use when a job has 3+ parts that can be worked on at the same time and speed matters.
  Aliases: /swarm, parallel, fan-out, multi-agent, swarm it.
  Triggers on: "swarm this", "/swarm", "use multiple agents", "run this in parallel",
  "split this across agents", "do all of these at once", "fan out", "as fast as possible with agents".
argument-hint: "<the job> [--strict] [--no-verify] [--gaps N] [--max-agents N] [--dry-run] [--yes]"
---

# /swarm: parallel multi-agent executor

Invoking this skill is the user's opt-in to multi-agent work, so do not ask "should I use agents?".
You still show the agent and token estimate and wait for a yes before launching (step 4), because
a swarm uses many times the tokens of a normal chat.

**Before starting:**
1. Read `references/learnings.md` (in this skill folder) and apply it.
2. Find this skill's folder. It is the folder this SKILL.md was loaded from, normally
   `$HOME/.claude/skills/swarm`. Confirm it and get the absolute path with:
   ```bash
   ls "$HOME/.claude/skills/swarm/scripts/swarm.workflow.js"
   ```
   If that fails, the skill is installed somewhere else (for example `<project>/.claude/skills/swarm`):
   use that folder instead. Call the absolute folder path `SKILL_DIR` below. Never pass a path
   containing `~` to a tool; always the full path starting with `/`.
3. Check whether you have a tool named `Workflow` (look in your tool list; if your session lists
   deferred tools, search for it by name). If you do, use it in step 4. If you do not, tell the user
   in one line ("No Workflow tool in this session, using the slower fallback") and use the fallback
   in step 4. Never pretend to have launched a workflow.

## Flags (parse from the arguments)

| Flag | Effect | Workflow arg |
|---|---|---|
| (none) | 1 sceptic per unit | `verify: "light"` |
| `--strict` | 2 sceptics per unit (different lenses), both must pass | `verify: "strict"` |
| `--no-verify` | skip verification (fast, for low-stakes bulk work) | `verify: "off"` |
| `--gaps N` | completeness-critic rounds, default 1, `0` turns it off | `gapRounds: N` |
| `--max-agents N` | hard ceiling on agents for the whole run | `maxAgents: N` |
| `--dry-run` | plan and validate only, show the plan, do not launch | |
| `--yes` | the user has already approved the cost: skip the confirmation in step 4 | |

## The procedure

### 1. Scout (you, inline, fast)
Spend at most about 10 tool calls understanding the job: what the inputs are, where they live, what
"done" looks like, and what the natural pieces are (files, pages, competitors, leads, sections, channels).
Use what is already in the project and the conversation instead of researching it again.

**Do not swarm** if there are fewer than 3 independent units, or the whole job is about 5 tool calls.
Say "this is faster done directly" and do it yourself.

If the job depends on choices only the user can make (style, tone, which option, existing designs),
ask those 2 or 3 questions NOW, before planning. Answers that arrive after launch force a paid re-run.

### 2. Plan the units
Split the job into units using these rules (more in `references/planning.md`, a full sample in
`references/example-plan.json`):
- **Independence test:** could a worker finish unit A knowing nothing about unit B? If not, merge them or put B in a later wave.
- **Waves:** units that need earlier output go in a later wave (`"wave": 2`). Foundation work (a scaffold, a shared brief, a schema, a data pull every unit needs) is wave 1 and finishes before builders start.
- **One owner per file per wave.** List `writes` and `reads` for every unit that touches files.
- **Size:** each unit is about 5 to 40 tool calls of work. Smaller means overhead, bigger means it stalls. Usually 3 to 12 units per wave. Only some run at once (up to 16, fewer on machines with fewer CPU cores); the rest queue, which is fine.
- **Unit ids** use letters, digits, `-` and `_` only, because each id becomes a file name (`units/<id>.md`).
- **Concrete done-condition** per unit (`deliverable`) and **runnable checks** where possible (`checks`: "word count under 300 by script", "page returns 200", "every lead has an email").
- `skill` (optional): only set it to the exact name of a skill that appears in your available-skills list in this session. If unsure, leave it out.
- `model` and `effort` (optional): leave them out so workers use the session's model. Only set `model` if the user asks for a cheaper or stronger model for a unit.
- **Browser and other single-seat tools:** only one unit at a time may drive a browser, a logged-in session, or anything rate-limited. Put those units in separate waves or one unit.
- **Outward-facing actions** (send, publish, deploy, post, pay, delete, message a person) are never done by workers. Plan them as a step YOU do after the swarm, with the user's go-ahead.

### 3. Write the run folder
Run folder: `<project>/.swarm/<YYYY-MM-DD>-<slug>/` if the current folder is a real project, otherwise
a temporary folder for this session. Use absolute paths everywhere. Create:
- `00-brief.md`: the locked facts every worker reads first: the job, the context, constraints,
  whether read-only network/API calls are allowed, numbers that must be used, voice rules, banned words,
  output format, paths. If the user's requirements conflict with a tool's defaults, say the user's
  requirements win. Keep it under about 600 words. This is how workers share context without you
  pasting it into every prompt.
- `plan.json`: `{ "job": "...", "units": [ {id, title, task, wave, writes, reads, deliverable, checks} ] }`
  (same shape as `references/example-plan.json`; `wave` is a number, the list fields are lists of text).
- `units/` (empty; workers write `units/<id>.md`)

Validate, passing the same verify mode and gap rounds you will launch with:
```bash
python3 "SKILL_DIR/scripts/validate_plan.py" "<runDir>/plan.json" --verify light --gaps 1
```
Fix every `[!]` error before launching. The last lines give the agent count ("at least N, worst case M")
and a rough token range: use those numbers in step 4, do not work them out by hand.
If `python3` is not installed, tell the user, check the rules in step 2 by hand, and count agents as:
units x 2 (light), x 3 (strict) or x 1 (off) as the minimum, plus 1 critic and 1 merge.

`--dry-run` stops here: show the plan as a table (id, wave, title, deliverable) plus the validator's output.

### 4. Confirm, then launch
Show the plan table and this line, then STOP and wait for the user's yes:

`Swarming: N units in W waves, verify=<mode>. Agents: at least A, worst case B. Rough tokens: X to Y. Go?`

Skip the wait only if the user passed `--yes` or already said to go ahead without checking. If the
worst case is over 40 agents, also offer `--no-verify`, fewer units, or `--max-agents`.
Tokens here means total usage across all agents; it counts against the user's plan limits or API bill.

Then call the Workflow tool:

```
Workflow({
  scriptPath: "SKILL_DIR/scripts/swarm.workflow.js",   // absolute path, no ~
  args: {
    job: "<user's request verbatim>",
    runDir: "<absolute run folder>",
    briefPath: "<absolute run folder>/00-brief.md",
    kind: "research" | "build" | "content" | "audit" | "mixed",
    units: [ ...the units array from plan.json... ],
    verify: "light" | "strict" | "off",
    gapRounds: 1,
    maxGapUnits: 5,
    maxAgents: <the worst-case number the user approved, or their --max-agents value>,
    useWorktrees: false,
    deliverablePath: "<absolute path of the final deliverable>"
  }
})
```
Pass `args` as a real JSON object, not a string. `kind` picks the sceptic's lens: see the table in
`references/planning.md`; use "mixed" if unsure.
- The engine never starts more than `maxAgents` agents. The critic may add at most `maxGapUnits`
  extra units per gap round; anything beyond that is logged as not run.
- `useWorktrees: true` only in a git repo where parallel units edit code. In a worktree each unit's
  changes land on its own branch, so you must merge them afterwards. Otherwise keep it false and rely on file ownership.

**Fallback (no Workflow tool):** do the same job with the Agent (subagent) tool by hand.
1. Send every wave-1 unit as its own Agent call, all in ONE message so they run at the same time,
   using the worker brief in `references/worker-brief.md`. At most 8 Agent calls per message; send
   the rest when those return.
2. When a wave has returned, send the next wave, including a short summary of earlier results.
3. Unless verify is off: one sceptic Agent call per unit (sceptic brief in the same file), again
   in one message. For a unit that fails, send ONE fix call with the must-fix list, then ONE re-check. No more.
4. Gap check: you act as the critic. Read every `units/<id>.md`, list what the job still lacks,
   and run at most 5 extra units the same way.
5. Merge yourself using `references/merge-rules.md` and write the deliverable.
If there is no Agent tool either, say so and do the units yourself one after another.

### 5. While it runs and when it returns
- Never guess at results before the Workflow tool returns or its completion notice arrives.
- To change the plan mid-run: stop it, edit the plan, relaunch with the same `scriptPath` plus
  `resumeFromRunId` (the run id from the tool result); unchanged units come back from cache.
- On return, read `final`, `units`, `agentsUsed` and `verifiedCount`. Do not trust them blindly. Open the
  deliverable, run any measurable check yourself (counts, links, a test run, a 200 check). If anything
  came back empty or `final` is null, read the `journal.jsonl` in the transcript folder named in the
  Workflow tool result, then merge by hand from `units/` using `references/merge-rules.md`.
- Units whose `verified` does not start with "pass" (fail after fix, unverified, not-run): fix them
  yourself if small, or tell the user one sentence each. Never present them as verified.
- Write `<runDir>/run.json` with the returned object plus today's date, for a record.

### 6. Do the outward-facing step
Any send/publish/deploy the job needs happens now, by you, only after the user approves it.

### 7. Brief the user
If the user's own instructions (their CLAUDE.md) say how they want reports, follow those. Otherwise:
verdict first, then what changed, decisions needed, what is blocked, in under about 200 words, with
the deliverable's path. Research, audits and lists get the full findings in the deliverable itself.
Always add one honest line on the swarm: `N agents, W waves, X of Y units verified.`

### 8. Learn
If something went wrong or a pattern worked unusually well, append one dated line to
`references/learnings.md` (what happened, then the rule for next time).

## References (load when needed)

| File | When |
|---|---|
| `references/planning.md` | Step 2: decomposition patterns per job type, sizing, a worked example |
| `references/example-plan.json` | Step 3: a complete valid plan.json to copy the shape from |
| `references/worker-brief.md` | Fallback mode, or to see what workers are told |
| `references/merge-rules.md` | Fallback mode, or when you merge by hand |
| `references/learnings.md` | Always, at the start |
| `scripts/validate_plan.py` | Step 3 |
| `scripts/swarm.workflow.js` | The engine: work, sceptic, one fix, re-check per unit; waves; capped gap critic; merge |
