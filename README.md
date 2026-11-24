# Swarm: a parallel multi-agent skill for Claude Code

Give Claude Code one big job and it splits the job into independent pieces, works on them at the
same time with several agents, checks every piece with a second, sceptical agent, looks for anything
that was missed, and hands you one finished result with a short summary.

## What it does, step by step

1. **Scouts** the job and asks you any questions that would change the plan.
2. **Plans** the job as "units" grouped into waves (wave 2 can use what wave 1 produced).
3. **Checks the plan** with a small script and shows you how many agents it will use.
4. **Waits for your yes**, then runs the units in parallel.
5. **Verifies** every unit with a fresh reviewer. A unit that fails gets one fix attempt and one re-check, no more.
6. **Looks for gaps** with a completeness critic, which may add up to 5 extra units.
7. **Merges** everything into one deliverable and tells you plainly which units passed and which did not.

Workers never send, publish, deploy, pay or delete anything. Any step like that is left for the
main Claude session to do afterwards, with your approval.

## What you need

| Need | Detail |
|---|---|
| A Mac with Claude Code | Built and used on Claude Code 2.1.326. Run `claude --version` to see yours and `claude update` to update. |
| The Workflow tool | The fast path uses a Claude Code tool called `Workflow`. To check, ask Claude Code: "Do you have a tool called Workflow?" If not, the skill says so and falls back to ordinary subagents, which is slower and less tidy but works. If you have neither, it will tell you and do the work one piece at a time. |
| A paid Claude plan or API billing with room to spare | See "What it costs". A small run uses roughly as much as several long chats. A large run can use up a plan's allowance for that session. |
| python3 (recommended) | Used only to check the plan. Test with `python3 --version`. If it is missing, run `xcode-select --install`. Without it the skill still runs but checks the plan by hand. |

No API keys, no accounts, no other skills and no settings changes are needed.

## Install

1. Unzip the download.
2. Open Terminal, then run:
   ```bash
   bash /path/to/swarm/install.sh
   ```
   (Type `bash `, then drag `install.sh` into the Terminal window, then press Enter.)
3. Open a **new** Claude Code session so it picks up the skill.

The installer copies the `skill` folder to `~/.claude/skills/swarm`. If you already had a skill there,
it is moved to `~/.claude/skills-backup/` first, never deleted.

To remove it: `rm -rf ~/.claude/skills/swarm`

## How to run it

Start with a dry run. It plans the job and shows the cost, and launches nothing:

```
/swarm --dry-run Compare Hugo, Eleventy and Astro for a small docs site and recommend one
```

Happy with the plan? Run it for real:

```
/swarm Compare Hugo, Eleventy and Astro for a small docs site and recommend one
```

Claude shows a line like this and waits for you:

`Swarming: 4 units in 2 waves, verify=light. Agents: at least 10, worst case 38. Rough tokens: 0.5M to 4.2M. Go?`

Options you can add:

| Option | What it does |
|---|---|
| `--dry-run` | Plan only. Launches nothing. |
| `--no-verify` | No reviewers. About half the agents. For low-stakes bulk work. |
| `--strict` | Two reviewers per unit. For money, public claims, production code. |
| `--gaps 0` | Turn off the completeness critic (and its extra units). |
| `--max-agents 12` | A hard ceiling. The engine will not start more agents than this; work it could not reach is reported as not run. |
| `--yes` | Skip the "Go?" question. Only use it once you know what a run costs you. |

Run files (the brief, the plan, each unit's report, the final deliverable) are saved in a `.swarm`
folder inside your project, so you can read exactly what each agent did.

## What it costs, in rough terms

Every agent is a full Claude session, so a swarm multiplies your usage. It does not cost money on
top of your plan, but it uses your plan's allowance (or your API credit) much faster than chatting.

How many agents a run starts:

| Part | Agents |
|---|---|
| Each unit, normal mode | 2 if the reviewer passes it, 4 if it needs the fix and re-check |
| Each unit, `--strict` | 3, or 5 if it needs the fix |
| Each unit, `--no-verify` | 1 |
| Completeness critic | 1 per gap round (default 1 round) |
| Extra gap units | 0 to 5 per round, each costing the same as a normal unit |
| Merge | 1 |

So a 4-unit job in normal mode is at least 10 agents and at most 38. Most runs land near the low end.

Tokens: the author's own runs came out at very roughly 50,000 to 110,000 tokens per agent. Three of them:

| Run | Agents | Tokens | Time |
|---|---|---|---|
| 14 units run one at a time, no verification | 15 | about 0.76 million | 79 min |
| 7-unit audit plus 2 gap units | 32 | about 3.6 million | 49 min |
| 25-item content job over 4 rounds of revisions | 46 | about 4.4 million | not recorded |

Your numbers will differ with the model you use, the size of your files and how much web research
is involved. Agents use whichever model your session is on; choosing a smaller model with `/model`
before you run makes a swarm cheaper. If you are on a plan with usage limits, a large swarm can hit
the limit part-way through. If that happens, wait for the limit to reset and ask Claude to resume the run.

## Good jobs and bad jobs

Good (several parts that do not depend on each other):

- "Research these 6 competitors and build one comparison table with a source for every fact."
- "Audit every page of this site for broken links, missing titles and slow images."
- "Write 12 product descriptions from these notes, each checked against the brand rules."
- "Add type hints to these 40 files" (bulk edits, split into batches).
- "Test these 4 theories about why checkout fails and tell me which one holds."
- "Summarise each of these 20 PDFs, then write one overview."

Bad (use a normal Claude session instead):

- Anything with fewer than 3 separable parts, or that takes a few minutes anyway. The skill will say "this is faster done directly".
- A chain where each step needs the one before (write, then edit, then polish the same file).
- Many edits to one single file. Only one agent may own a file at a time.
- Work that all goes through one logged-in browser or one rate-limited account. That can only be done one at a time.
- Sending, publishing, paying or deleting. Agents are not allowed to; the main session does it with your approval.
- Very long local jobs such as video rendering. Run those as a script and use the swarm only to check the results.
- Jobs where you have not decided what you want yet. Changing the rules mid-run means paying for the run again.

## Troubleshooting

| Problem | What to do |
|---|---|
| `/swarm` is not recognised | Open a new Claude Code session. Check the folder exists: `ls ~/.claude/skills/swarm/SKILL.md`. If not, run `install.sh` again. |
| "No Workflow tool in this session" | Update Claude Code (`claude update`) and try a new session. If it is still missing, your version or plan does not include it; the skill carries on with the slower fallback. |
| `python3: command not found` | Run `xcode-select --install`, or let the skill check the plan by hand. |
| The plan check prints `[!]` lines | Those are real problems (two units writing one file, a duplicate id). Claude should fix them and re-check before launching. If it does not, say "fix the plan errors first". |
| You hit your usage limit mid-run | Unit reports already written stay in the run's `units` folder. After the limit resets, say "resume the swarm run"; Claude Code's resume feature is designed to reuse finished units rather than redo them. |
| Some units say "fail after fix" or "unverified" | The summary must list these. Ask Claude to fix them directly, or re-run just those parts. Do not treat them as checked. |
| It planned far more units than you expected | Say no at the "Go?" line and ask for fewer, larger units, or add `--max-agents N`. |
| It seems stuck | A wave takes as long as its slowest unit. Units over about 40 tool calls tend to stall: stop the run and ask for the big unit to be split. |
| It wants to edit code in parallel in a git project | That uses git worktrees and leaves one branch per unit for you to merge. If you do not want that, say "no worktrees". |
| You want to see what each agent did | Open the `.swarm/<date>-<name>/units/` folder in your project. |

## What is in this folder

```
swarm/
  README.md          this file
  install.sh         copies skill/ to ~/.claude/skills/swarm
  skill/
    SKILL.md                      the instructions Claude follows
    CHANGELOG.md
    scripts/swarm.workflow.js     the engine the Workflow tool runs
    scripts/validate_plan.py      the plan checker
    references/                   planning guide, example plan, briefs, merge rules, lessons learned
```
