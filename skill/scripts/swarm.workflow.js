export const meta = {
  name: 'swarm',
  description: 'Run a planned job as parallel waves of agents, verify every unit, fill gaps, merge into one result',
  whenToUse: 'Launched by the /swarm skill with args = { job, runDir, briefPath, units, ... }',
  phases: [
    { title: 'Execute', detail: 'one agent per unit, waves in order, units inside a wave in parallel' },
    { title: 'Verify', detail: 'a fresh sceptic checks each unit; one fix attempt on failure' },
    { title: 'Gaps', detail: 'completeness critic, then a capped number of extra units for anything missing' },
    { title: 'Merge', detail: 'one synthesis agent combines every unit into the deliverable' },
  ],
}

// ---------- args ----------
// {
//   job: string,                    // the user's request, verbatim (required)
//   runDir: string,                 // absolute folder for this run's files (required)
//   briefPath: string,              // absolute path to 00-brief.md (required)
//   kind: 'research'|'build'|'content'|'audit'|'mixed',   // default 'mixed'
//   units: [{ id, title, task, wave?, writes?, reads?, deliverable?, checks?, skill?, model?, effort? }],
//   verify: 'off'|'light'|'strict', // default 'light' (1 sceptic); strict = 2 sceptics, both must pass
//   gapRounds: number,              // default 1; 0 disables the completeness critic
//   maxGapUnits: number,            // default 5; most extra units the critic may add per round
//   maxAgents: number,              // optional hard ceiling on agents for the whole run
//   useWorktrees: boolean,          // default false; only in a git repo, for parallel code edits
//   deliverablePath: string,        // where the merged deliverable is written
// }
const A = args || {}
const SAFE_ID = /^[A-Za-z0-9_-]+$/
if (typeof A.job !== 'string' || !A.job.trim()) throw new Error('swarm: args.job is missing')
if (typeof A.runDir !== 'string' || !A.runDir.startsWith('/')) throw new Error('swarm: args.runDir must be an absolute path')
if (typeof A.briefPath !== 'string' || !A.briefPath.startsWith('/')) throw new Error('swarm: args.briefPath must be an absolute path')
if (!Array.isArray(A.units) || !A.units.length) throw new Error('swarm: args.units is empty (pass args as a real object, not a JSON string)')
const UNITS = A.units.map(u => ({ ...u }))
const seenIds = {}
for (const u of UNITS) {
  if (!u || typeof u.id !== 'string' || !SAFE_ID.test(u.id)) throw new Error('swarm: every unit needs an id made of letters, digits, - or _')
  if (seenIds[u.id]) throw new Error(`swarm: duplicate unit id "${u.id}"`)
  seenIds[u.id] = true
  if (typeof u.task !== 'string' || !u.task.trim()) throw new Error(`swarm: unit "${u.id}" has no task`)
  if (!u.title) u.title = u.id
  const w = Number(u.wave === undefined ? 1 : u.wave)
  if (!Number.isInteger(w) || w < 1) throw new Error(`swarm: unit "${u.id}" has an invalid wave (use a whole number from 1)`)
  u.wave = w
}
const RUN = A.runDir.replace(/\/+$/, '')
const BRIEF = A.briefPath
const VERIFY = ['off', 'light', 'strict'].includes(A.verify) ? A.verify : 'light'
const GAP_ROUNDS = Number.isInteger(A.gapRounds) && A.gapRounds >= 0 ? A.gapRounds : 1
const MAX_GAP_UNITS = Number.isInteger(A.maxGapUnits) && A.maxGapUnits >= 0 ? A.maxGapUnits : 5
const KIND = A.kind || 'mixed'
const DELIVERABLE = A.deliverablePath || RUN + '/DELIVERABLE.md'

// agent arithmetic: keep in step with scripts/validate_plan.py
const PER_UNIT_MIN = VERIFY === 'off' ? 1 : VERIFY === 'strict' ? 3 : 2
const PER_UNIT_MAX = VERIFY === 'off' ? 1 : VERIFY === 'strict' ? 5 : 4
const MIN_AGENTS = UNITS.length * PER_UNIT_MIN + (GAP_ROUNDS > 0 ? 1 : 0) + 1
const WORST_CASE = UNITS.length * PER_UNIT_MAX + GAP_ROUNDS * (1 + MAX_GAP_UNITS * PER_UNIT_MAX) + 1
const MAX_AGENTS = Number.isInteger(A.maxAgents) && A.maxAgents > 0 ? A.maxAgents : WORST_CASE
let spawned = 0
let capLogged = false
// every agent goes through here so the ceiling is real; one slot is always kept for the merge
async function spawn(prompt, opts, isMerge) {
  if (spawned >= (isMerge ? MAX_AGENTS : MAX_AGENTS - 1)) {
    if (!capLogged) { capLogged = true; log(`Agent ceiling of ${MAX_AGENTS} reached: remaining work is skipped and reported as not run`) }
    return null
  }
  spawned++
  return agent(prompt, opts)
}

const WORK_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string', description: 'What was produced, max 120 words. Facts, not process.' },
    outputs: { type: 'array', items: { type: 'string' }, description: 'Absolute paths of files written or changed' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          basis: { type: 'string', enum: ['fact', 'inference', 'speculation'] },
          source: { type: 'string', description: 'file:line, URL, or command that proves it' },
        },
        required: ['text', 'basis'],
      },
    },
    selfCheck: {
      type: 'array',
      items: { type: 'object', properties: { check: { type: 'string' }, passed: { type: 'boolean' } }, required: ['check', 'passed'] },
    },
    blockers: { type: 'array', items: { type: 'string' }, description: 'Decisions or access only the user can give' },
  },
  required: ['status', 'summary', 'outputs', 'selfCheck', 'blockers'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['must-fix', 'should-fix', 'nit'] },
          issue: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'issue', 'fix'],
      },
    },
  },
  required: ['pass', 'issues'],
}

const GAPS_SCHEMA = {
  type: 'object',
  properties: {
    complete: { type: 'boolean' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          task: { type: 'string' },
          priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
          writes: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'task', 'priority'],
      },
    },
  },
  required: ['complete', 'gaps'],
}

const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', description: 'One sentence: is the job done, and how well' },
    deliverablePath: { type: 'string' },
    whatChanged: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' }, description: 'Decisions the user must make, one sentence each' },
    blocked: { type: 'array', items: { type: 'string' } },
    conflicts: { type: 'array', items: { type: 'string' }, description: 'Contradictions kept with attribution' },
  },
  required: ['verdict', 'deliverablePath', 'whatChanged', 'decisions', 'blocked'],
}

// ---------- prompts ----------
function workerPrompt(u, allUnits, prior) {
  const others = allUnits.filter(o => o.id !== u.id).map(o => `- ${o.id}: ${o.title}`).join('\n')
  const priorText = prior.length
    ? prior.map(p => `- ${p.id} (${p.status}): ${p.summary}${p.outputs && p.outputs.length ? ' | files: ' + p.outputs.join(', ') : ''}`).join('\n')
    : '(none, you are in the first wave)'
  return `You are one worker in a parallel swarm. Other agents are working on the other parts at the same time.

## Overall job
${A.job}

## Read first
${BRIEF} : locked facts, constraints and output rules for this run. It overrides anything you assume.

## Your unit: ${u.id}, ${u.title}
${u.task}
${u.skill ? `\nLoad the \`${u.skill}\` skill with the Skill tool before you start and follow it. If that skill is not installed, carry on without it and say so in your summary.` : ''}

## Boundaries
- Files you may create or change (exclusive to you in this wave): ${(u.writes && u.writes.length) ? u.writes.join(', ') : 'none except your own report'}
- Files you may read but must NOT change: ${(u.reads && u.reads.length) ? u.reads.join(', ') : 'anything relevant, read-only'}
- Your report file: ${RUN}/units/${u.id}.md (always write it: findings or work done, with sources)
- Do not do another unit's work. They are:
${others || '(none)'}
- Never send, publish, deploy, pay, delete or message anyone outside this machine. If the unit needs that, stop and list it under blockers.
- Do not start further agents or workflows of your own.
- Write long outputs in parts (several writes of under ~1,800 words each), not one giant write.

## Results from earlier waves
${priorText}

## Done means
${u.deliverable || 'The unit task is fully completed and the report file exists.'}
${u.checks && u.checks.length ? '\nRun these checks yourself before finishing:\n' + u.checks.map(c => '- ' + c).join('\n') : ''}

## Rules
- Tag every important claim as fact (with a source: file:line, URL or command output), inference or speculation. If you could not find something, say "no data found for X". Never invent it.
- Self-check before you finish. If a check fails, fix it. If you cannot, set status to partial and say why. Never report done on a failing check.
- Missing access or a decision only the user can make goes in blockers. Do not guess.
- Your final answer is data for the orchestrator, not a message to a person.`
}

function verifyPrompt(u, r, lens) {
  return `You are a sceptical reviewer in a parallel swarm. Your job is to find what is WRONG with one unit's work. You did not do the work.

## Overall job
${A.job}

## Brief (locked facts and rules)
${BRIEF}

## Unit under review: ${u.id}, ${u.title}
Task it was given:
${u.task}

Definition of done: ${u.deliverable || 'unit task fully completed, report file exists'}
${u.checks && u.checks.length ? 'Required checks:\n' + u.checks.map(c => '- ' + c).join('\n') : ''}

What the worker reported (do not trust it, check it):
status: ${r.status}
summary: ${r.summary}
files: ${(r.outputs || []).join(', ') || 'none'}
report: ${RUN}/units/${u.id}.md

## Your lens: ${lens}
Open the actual files. Re-run any check that can be run (scripts, tests, word counts, link checks, grep). Confirm sourced claims against their sources. Look for: anything missing from the task, factual errors, invented data, broken files, contradictions with the brief, work outside the unit's boundaries.

Severity rules:
- must-fix = something wrong or missing that would change a conclusion, a decision or a deliverable the user relies on (a wrong figure, an invented source, a broken file, a whole required part missing, a confident claim you can show is false).
- should-fix = imperfect but the conclusions stand (a few low-value items missed in a huge scope, wording, formatting). Do NOT fail a unit for incompleteness at the margins of a very large scope; list the specific missed items as should-fix.
- Spot-check rather than re-do: sample the claims that matter most (largest, most surprising, customer-facing) and confirm them. Do not redo the whole unit.
pass = true only if there are no must-fix issues, and pass = false only if there is at least one. If you are unsure whether a claim that matters is right, that is must-fix with the evidence you found. Do not edit any files. Do not start further agents.`
}

function fixPrompt(u, r, issues, prior) {
  return `${workerPrompt(u, UNITS, prior)}

## THIS IS A FIX PASS
A reviewer checked your unit's earlier attempt and found these issues that must be fixed:
${issues.map((i, n) => `${n + 1}. ${i.issue}${i.evidence ? ' (evidence: ' + i.evidence + ')' : ''} -> fix: ${i.fix}`).join('\n')}

Earlier summary: ${r.summary}
Fix every issue in place. Do not start over unless the work is unusable. Update ${RUN}/units/${u.id}.md.`
}

// ---------- stages ----------
const LENSES = {
  research: ['accuracy: are claims true and sourced', 'coverage: what did the task ask for that is missing'],
  build: ['correctness: does it actually work, run it', 'completeness: is every requirement met, nothing stubbed'],
  content: ['brief compliance: facts, voice, banned words, length', 'quality: would the target reader act on this'],
  audit: ['accuracy: is every pass/fail real, re-check it', 'coverage: what was not checked'],
  mixed: ['correctness: is it right, re-check it', 'completeness: is every requirement met'],
}

function lostUnit(u, why) {
  return { id: u.id, title: u.title, status: 'blocked', summary: why, outputs: [], selfCheck: [], blockers: [why], verified: 'not-run (blocked)' }
}

async function runUnit(u, prior) {
  const opts = { label: u.id, phase: 'Execute', schema: WORK_SCHEMA }
  if (u.model) opts.model = u.model
  if (u.effort) opts.effort = u.effort
  if (A.useWorktrees && u.writes && u.writes.length) opts.isolation = 'worktree'
  const r = await spawn(workerPrompt(u, UNITS, prior), opts)
  return r ? { ...r, id: u.id, title: u.title } : lostUnit(u, 'worker did not return (agent died, was skipped, or the agent ceiling was reached)')
}

async function verifyUnit(u, r, prior) {
  if (VERIFY === 'off') return { ...r, verified: 'skipped' }
  if (r.status === 'blocked') return { ...r, verified: 'not-run (blocked)' }
  const lenses = LENSES[KIND] || LENSES.mixed
  const use = VERIFY === 'strict' ? lenses : [lenses[0] + '; also ' + lenses[1]]
  const votes = (await parallel(use.map(l => () =>
    spawn(verifyPrompt(u, r, l), { label: `verify:${u.id}`, phase: 'Verify', schema: VERDICT_SCHEMA })))).filter(Boolean)
  if (!votes.length) return { ...r, verified: 'unverified (no reviewer returned)' }
  const all = votes.flatMap(v => v.issues || [])
  const mustFix = all.filter(i => i.severity === 'must-fix')
  const notes = all.filter(i => i.severity !== 'must-fix')
  const failed = mustFix.length > 0 || votes.some(v => !v.pass)
  if (!failed) {
    const short = votes.length < use.length
    return { ...r, verified: short ? `pass (only ${votes.length} of ${use.length} reviewers returned)` : 'pass', notes }
  }
  // a reviewer can say fail without tagging anything must-fix: then fix what it did list
  const toFix = mustFix.length ? mustFix : all.filter(i => i.severity === 'should-fix')
  if (!toFix.length) return { ...r, verified: 'unverified (reviewer failed it without naming an issue)', notes }

  // one fix attempt, then one re-check
  const fixed = await spawn(fixPrompt(u, r, toFix, prior), { label: `fix:${u.id}`, phase: 'Verify', schema: WORK_SCHEMA })
  if (!fixed) return { ...r, verified: 'fail (fix pass did not run)', mustFix: toFix }
  const again = await spawn(verifyPrompt(u, fixed, use.join('; ')), { label: `recheck:${u.id}`, phase: 'Verify', schema: VERDICT_SCHEMA })
  const left = again ? (again.issues || []).filter(i => i.severity === 'must-fix') : toFix
  return { ...fixed, id: u.id, title: u.title, verified: again && again.pass && !left.length ? 'pass after fix' : 'fail after fix', mustFix: left }
}

async function runWave(units, prior) {
  // pipeline: each unit goes straight from work to verify, no waiting for siblings.
  // Nothing may vanish: a stage that throws still yields a result for its unit.
  const out = await pipeline(units,
    async u => { try { return await runUnit(u, prior) } catch (e) { return lostUnit(u, 'worker stage error: ' + String(e && e.message || e)) } },
    async (r, u) => { try { return await verifyUnit(u, r, prior) } catch (e) { return { ...r, verified: 'unverified (verify stage error: ' + String(e && e.message || e) + ')' } } })
  return out.map((r, i) => r || lostUnit(units[i], 'unit was dropped by the engine before it finished'))
}

// ---------- main ----------
log(`Swarm: ${UNITS.length} unit(s), verify=${VERIFY}, gap rounds=${GAP_ROUNDS} (max ${MAX_GAP_UNITS} extra units each). Agents: at least ${MIN_AGENTS}, worst case ${WORST_CASE}, ceiling ${MAX_AGENTS}.`)
const waves = {}
for (const u of UNITS) (waves[u.wave] = waves[u.wave] || []).push(u)
const order = Object.keys(waves).map(Number).sort((a, b) => a - b)

const results = []
for (const w of order) {
  phase('Execute')
  log(`Wave ${w}: ${waves[w].length} unit(s): ${waves[w].map(u => u.id).join(', ')}`)
  const out = await runWave(waves[w], results.slice())
  results.push(...out)
  const bad = out.filter(r => r.status === 'blocked' || !String(r.verified).startsWith('pass') && r.verified !== 'skipped')
  if (bad.length) log(`Wave ${w}: ${bad.length} unit(s) blocked or not verified: ${bad.map(b => `${b.id} [${b.verified}]`).join(', ')}`)
}

// gap rounds: completeness critic -> a capped number of new units -> same execute/verify path
let rounds = 0
while (rounds < GAP_ROUNDS) {
  rounds++
  phase('Gaps')
  let critic = null
  try {
    critic = await spawn(`You are the completeness critic for a parallel swarm. Decide what is MISSING before the results are merged.

Job: ${A.job}
Brief: ${BRIEF}
Unit reports are in ${RUN}/units/. Results so far:
${results.map(r => `- ${r.id} [${r.status}, ${r.verified}]: ${r.summary}`).join('\n')}

List only real gaps: a part of the job nobody covered, a claim nobody verified, a failed unit that needs redoing a different way, an input nobody read. Not polish. Each gap becomes one new self-contained unit task with a short id made of letters, digits and hyphens. At most ${MAX_GAP_UNITS} gaps will be run, most important first, so merge small related gaps into one. P1 = the job is not done without it. complete=true if there are no P1 or P2 gaps. Do not start further agents.`,
      { label: `critic:${rounds}`, phase: 'Gaps', schema: GAPS_SCHEMA })
  } catch (e) {
    log(`Gap round ${rounds}: the critic could not run (${String(e && e.message || e)}); going straight to the merge`)
  }
  const found = critic ? (critic.gaps || []) : []
  const rank = { P1: 0, P2: 1 }
  const wanted = found.filter(g => g.priority !== 'P3').sort((a, b) => rank[a.priority] - rank[b.priority])
  const gaps = wanted.slice(0, MAX_GAP_UNITS)
  const dropped = found.filter(g => !gaps.includes(g))
  if (dropped.length) log(`Gap round ${rounds}: ${dropped.length} gap(s) NOT run (P3, or over the limit of ${MAX_GAP_UNITS}): ${dropped.map(g => `${g.priority} ${g.title}`).join('; ')}`)
  if (!gaps.length) { log(`Gap round ${rounds}: nothing to run`); break }
  const gapUnits = gaps.map((g, i) => {
    let id = `gap${rounds}-` + String(g.id).replace(/^gap\d*-/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    if (id === `gap${rounds}-` || seenIds[id]) id = `gap${rounds}-${i + 1}`
    seenIds[id] = true
    return { id, title: g.title, task: g.task, wave: order.length + rounds, writes: g.writes || [], reads: [] }
  })
  log(`Gap round ${rounds}: ${gapUnits.length} new unit(s): ${gapUnits.map(g => g.id).join(', ')}`)
  UNITS.push(...gapUnits)
  results.push(...await runWave(gapUnits, results.slice()))
}

// merge
phase('Merge')
let final = null
try {
  final = await spawn(`You are the synthesis agent for a parallel swarm. Combine every unit into ONE deliverable.

Job: ${A.job}
Brief: ${BRIEF}
Unit reports: ${RUN}/units/*.md (read all of them, and the files they list)
Write the deliverable to: ${DELIVERABLE}

Results:
${results.map(r => `- ${r.id} [${r.status}, ${r.verified}] ${r.summary}${r.blockers && r.blockers.length ? ' | BLOCKERS: ' + r.blockers.join('; ') : ''}${r.mustFix && r.mustFix.length ? ' | UNFIXED: ' + r.mustFix.map(i => i.issue).join('; ') : ''}`).join('\n')}

Merge rules:
- Identical points: keep once. Complementary points: combine. Different detail levels: keep the more detailed one as the base.
- Contradictions: do NOT average or pick silently. Keep both, say which unit said what, and say which has the stronger source.
- Organise by theme or by the structure the job needs, not by unit order.
- Anything from a unit that failed verification is marked as unverified, or left out with a note saying why.
- Silence is not agreement: one unit saying something does not make it a consensus.
- For build jobs, the deliverable is a short change log plus how to verify each change, not a copy of the code.
- Do not start further agents.

Return the verdict, what changed or what is now live, decisions only the user can make, what is blocked, and the contradictions you kept.`,
    { label: 'synthesis', phase: 'Merge', schema: FINAL_SCHEMA }, true)
} catch (e) {
  log(`Merge did not run (${String(e && e.message || e)}): merge by hand from ${RUN}/units/`)
}
if (!final) log(`No merged deliverable was written. The unit reports are in ${RUN}/units/.`)

return {
  final,
  units: results.map(r => ({ id: r.id, title: r.title, status: r.status, verified: r.verified, summary: r.summary, outputs: r.outputs, blockers: r.blockers, unfixed: (r.mustFix || []).map(i => i.issue), notes: (r.notes || []).map(i => i.issue) })),
  gapRounds: rounds,
  agentsUsed: spawned,
  agentsWorstCase: WORST_CASE,
  verifiedCount: results.filter(r => String(r.verified).startsWith('pass')).length,
}
