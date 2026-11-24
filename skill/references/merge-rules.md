# Merge rules

## Per point
| Situation | Do |
|---|---|
| Identical across units | Keep once. Note how many units found it (more units = stronger signal) |
| Complementary | Combine into one point |
| Same point, different detail | Use the most detailed version as the base, add unique details from the others |
| Contradictory | **Keep both, credited to each unit.** Say which has the stronger source. Never average, never pick silently |
| From a unit that failed verification | Mark "unverified", or leave it out and say why |
| Said by only one unit | It's a single finding, not a consensus. Silence from the others is not agreement |

## The 8 steps (analysis jobs)
1. Extract: every claim from every unit report.
2. Cluster: group by theme, not by unit.
3. Count: how many independent units support each point.
4. Identify: the contradictions.
5. Evaluate: the source quality behind each side (fact with source > inference > speculation).
6. Resolve: the stronger evidence wins. If neither is stronger, it becomes a decision for the user.
7. Flag: gaps, unverified items, blockers.
8. Compose: in the structure the job needs, verdict first.

## Build jobs
The deliverable is a change log (file, what changed, how it was verified) plus anything still failing.
Not a copy of the code.

## Content jobs
One document with every asset in final form, ranked or ordered as the job needs. Run measurable checks
(word counts, banned words, any style rule in the brief) with a script across the merged output, not by eye.
