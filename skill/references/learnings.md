# /swarm learnings

One dated line each: what happened, then the rule for next time. Read at the start of every run.
Add your own lines under "From your runs" (step 8 of the skill).

## Starter lessons (shipped with the skill)
- A foundation wave must finish and be verified before builders start.
- Only one agent at a time may drive a browser or any logged-in session.
- File ownership must cover every file type, not just code (styles, config, spreadsheets).
- An agent that says "done" is not proof. Re-read the real state before reporting.
- Sub-agents writing one giant file stall. Write in parts under about 1,800 words.
- Ask the 2 or 3 questions that change the rules (style, tone, existing designs) BEFORE launching and put the answers in the brief. Answers that arrive mid-run force paid revision rounds.
- Run measurable checks (counts, banned words) by script, not by eye.
- If more than 10 issues remain after a fix pass, rebuild the unit rather than patching again.
- Each wave takes as long as its largest unit. Split huge scopes (a very large folder, a long list) into several units.
- Sceptics tend to fail units for small misses at the edge of a very large scope, and the fix pass then changes nothing. The engine separates must-fix from should-fix for this reason; keep unit scopes bounded.
- The gap critic often finds the most important missing piece. Keep gap rounds at 1 or more for audits.
- The brief must say whether read-only network or API calls are allowed. "Read-only" alone gets read two ways.
- The brief must rank the user's explicit requirements above any tool or template defaults.
- Heavy local jobs (video renders, long builds) work best as one tested script that workers run and check, not as free-form agent work. For steps over 10 minutes, have the worker start the script in the background and poll for a done-file, or run the script in a plain shell loop and use agents only to verify.

## From your runs
