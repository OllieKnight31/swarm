# Planning units for /swarm

## The three tests (every plan)
1. **Independence:** could unit A be finished by someone who knows nothing about unit B? If not, merge them or move B to a later wave.
2. **No overlap:** does any piece of the job belong to two units? Then two agents do it twice and the merge has conflicts. Give it to one unit.
3. **Coverage:** add up all the units. Is anything in the job left out? If so, it has no owner and will not be done.

## Decomposition patterns by job type

| Job type | Split by | Typical waves | `kind` |
|---|---|---|---|
| Research / competitive analysis | One angle each (competitors, customer language, market data, forums, internal notes), or one entity each | w1 sweep, gap round, merge | research |
| Audit / health check | One system or check-group each (pages, workflows, integrations, data) | w1 checks, merge as a full pass/fail table | audit |
| Content production | One asset each (ad 1..N, email 1..N, post 1..N). Shared voice and facts live in the brief | w1 (optional: angle research), w2 assets | content |
| Code build | One module or layer each, with exclusive file ownership | w1 foundation (schema, types, scaffold), w2 features, w3 integration test | build |
| Bulk edit / migration | One batch of files or records each (10 to 30 items per unit) | w1 batches | build |
| Data enrichment / lists | One slice of rows each (by range or by source) | w1 slices, merge into one sheet | research |
| Debugging | One hypothesis each ("it's the webhook", "it's the auth"), each tries to PROVE theirs | w1 hypotheses, you pick | audit |
| Strategy / decision | One independent approach each (risk-first, speed-first, cost-first) | w1 approaches, merge picks the winner and grafts the best ideas | mixed |

## Sizing and agent counts
- About **5 to 40 tool calls per unit**. If a unit needs more, split it. If several units are 2-call lookups, batch them into one.
- **3 to 12 units per wave** is normal. More is fine (they queue), but fifty tiny units cost more than they save.
- Agents per unit: **2** with light verification when the sceptic passes it (worker + sceptic), **4** when it fails
  (plus one fixer and one re-check). Strict: 3, or 5 on failure. Verify off: 1.
- On top: 1 critic per gap round, up to 5 extra gap units per round (each costs the same as a normal unit), and 1 merge agent.
- `scripts/validate_plan.py` prints the minimum and worst-case totals for your plan. Use its numbers.
- Low-stakes bulk work: `--no-verify` and spot-check yourself. High-stakes (money, public claims, production code): `--strict`.

## Writing a unit task
A good `task` names the inputs (paths, URLs, IDs), the exact output (file, format, count), and where to stop.
Bad: "Research competitors."
Good: "Research these 4 competitors: A, B, C, D. For each: offer, price, guarantee, sign-up steps, top 3 ad hooks, with a URL per fact. Write a table to units/competitors.md. Stop at 4. Do not research others."

Fixed numeric deliverables ("20 verbatim customer phrases with source") beat open-ended ones.

## Single-seat resources (never parallel)
- Browser sessions and logged-in browser profiles (any web app driven through the browser).
- APIs with tight rate limits or daily quotas.
- A single spreadsheet tab or database table several units would write to: each unit writes its own file and the merge writes the shared target once.

## Worked example
Job: "Write 12 short product descriptions for the spring catalogue and check them against the brand rules."
- 00-brief.md: product facts, prices, banned claims, voice, length 60 to 90 words.
- w1: `angles` (read the product notes and reviews, pick 12 distinct angles, write units/angles.md)
- w2: `desc-1-4`, `desc-5-8`, `desc-9-12` (each reads units/angles.md, writes 4 descriptions to its own report file), checks: "word count 60 to 90 per description by script", "no banned words by grep"
- verify: content lens. Merge into one document in catalogue order.

A complete plan.json in the right shape is in `references/example-plan.json`.
