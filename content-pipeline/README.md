# Content pipeline

Writes, validates, stages, build-verifies, and PR-publishes blog articles for
Rootconverter.

**Phase 2 — AI writing, with deterministic quality control.** Three agents
(outliner, writer, reviser) produce articles; five deterministic gates decide
whether they ship. Research and a separate editorial pass are still to come.

📖 **[USAGE.md](USAGE.md) — step-by-step walkthrough and troubleshooting.**
Start there if you just want to use it.
This file covers what it is; [the architecture doc](../docs/content-pipeline-architecture.md)
covers why it's built this way.

---

## Setup

```bash
cp content-pipeline/.env.example .env        # at the REPO ROOT
# then put your key in it: ANTHROPIC_API_KEY=sk-ant-...
npm run pipeline -- doctor                   # confirms key + registry
```

No key? Every command takes `--mock`, which uses a built-in fake model: no
network, no cost, schema-shaped output. The whole pipeline runs, so you can
exercise everything except the actual writing.

## Quick start

Write an article:

```bash
npm run pipeline -- topic "What Base64 encoding does and when to avoid it"
npm run pipeline -- run <job-id>
```

That runs outline → draft → review → (revise if needed) → stage → pull request.
Merging the PR deploys it.

Check an article you wrote yourself:

```bash
npm run pipeline -- check path/to/article.md
```

Runs every gate and prints what's wrong with a suggested fix. Exit code 0 if
publishable, 1 otherwise — so it drops straight into a hook or CI.

Publish a hand-written one:

```bash
npm run pipeline -- ingest path/to/article.md
npm run pipeline -- run <job-id>
```

---

## Why a pull request, and not just a commit

This repo auto-deploys to Cloudflare on every push to `master`. There is no
staging environment, so a commit *is* a live publish with no undo.

The pipeline therefore never commits to `master`. It branches, commits, and
opens a PR for you to merge. Roughly thirty seconds of review converts the
worst possible failure — unreviewed content on a production domain — into a PR
you close. There are also rate caps (`config/pipeline.config.js`) so that a
mistyped command cannot become forty live articles: a sudden flood of new
pages is exactly the pattern search engines treat as scaled content abuse, and
that damage is slow to undo.

---

## Commands

| Command | Does |
| --- | --- |
| `topic "<topic>"` | Create a job from a topic, to be written by AI. |
| `check <file.md>` | Run all gates against a file. No job, no side effects. |
| `doctor` | Check API key, provider, and tool registry. |
| `ingest <file.md>` | Create a job from a file. |
| `run <job-id>` | Advance the job as far as it can go. |
| `step <job-id> <step>` | Run exactly one step. |
| `status <job-id>` | State, latest verdicts, artifacts. Add `--verbose` for full history. |
| `jobs` | List jobs. `--state staged` to filter. |
| `artifacts <job-id> [name]` | List artifacts, or print one. |
| `quarantine <job-id> [reason]` | Park a job for human attention. |
| `abandon <job-id>` | Drop a job. |
| `gates` / `states` | Show the configured gates / the state graph. |

Useful flags: `--mock` (fake model, no cost), `--dry-run` (publish: show what
would happen, change nothing), `--no-pr` (commit to a branch without opening a
PR), `--skip-build` (faster staging, less safe), `--json`, `--verbose`.

---

## The agents

| Agent | Tier | Does |
| --- | --- | --- |
| `outliner` | standard | Topic → structure. No prose. |
| `writer` | frontier | Outline → article. The only step that writes body text. |
| `reviser` | standard | Findings → targeted fixes. Never rewrites wholesale. |

Prompts live in `prompts/<agent>/v<N>.md`, versioned, never in code. Each
declares its model tier, temperature, and output schema in a small header. `v2`
is a new file; `v1` stays, and the version used is recorded in every job's
event log — so a quality regression is bisectable instead of a mystery.

Shared voice lives once in `config/house-style.md` and is injected into all
three. **It must agree with `src/gates/prose.gate.js`**: the gate rejects what
that file forbids, so a disagreement means every article burns a revision cycle
fixing something the prompt told it to do.

### Why the revision loop can't run away

"Send it back for improvement" is an unbounded spend loop unless something
stops it. Three things do:

1. **Bounded budget** — 2 revisions per gate, 4 per job (`config/pipeline.config.js`).
2. **Oscillation detection** — if the error count stops falling between rounds,
   the model is fixing one gate while breaking another. Further attempts are
   provably wasted, so the job is quarantined early.
3. **Diff-scoped prompts** — the reviser receives only the specific findings,
   never "improve this article". Open-ended rewrites are what cause the
   oscillation in the first place.

Anything that trips a guard goes to `quarantined`, which is not a failure: it
means the system correctly decided a human should look.

### Cost

Steps request a model *tier*, never a model name, so the expensive model is
used only for drafting. Per-job and per-run caps are enforced **before** each
call, and every call's tokens and cost land in the job's `events.jsonl`.
`status` shows the total.

⚠ The rates in `config/models.js` are placeholders. Check them against current
pricing before trusting the caps.

---

## The gates

Run cheapest-first; a run stops at the first tier that fails, so nothing
expensive ever runs on an article whose frontmatter doesn't parse.

**Tier 0** — structural, instant

| Gate | Catches |
| --- | --- |
| `frontmatter` | Schema violations, unknown category, duplicate slug, filename/slug mismatch. |
| `links` | **Tool ids that don't exist**, unpublished article references, missing cover images, broken internal links. |
| `markdown` | An `h1` in the body, skipped heading levels, dead anchors, untagged code fences, images without alt text, length. |

**Tier 1** — content quality

| Gate | Catches |
| --- | --- |
| `dedup` | Near-duplicates of articles you already published. |
| `prose` | Filler phrases, weasel words, repetitive sentence openings, keyword stuffing, readability. |

The `links` gate is the important one. Most factual claims in these articles
are claims about *this site's own tools*, and a model confidently referencing a
tool that doesn't exist is far likelier than it misremembering what Base64 is.
That is checkable against `src/tools/registry.js` with total certainty, for
free — which is why this pipeline does not use an LLM to fact-check itself.

`error` blocks publication; `warn` is reported but doesn't. Any check that can
produce false positives on legitimate content is a warning by design.

---

## Writing an article

Start from [`src/content/blog/_TEMPLATE.md`](../src/content/blog/_TEMPLATE.md).
It documents every frontmatter field and the markdown conventions (callouts,
code fences) that the site's renderer supports.

Two rules that trip people up:

- **Don't put an `h1` in the body.** The page renders its `h1` from the
  frontmatter `title`; a second one is a real accessibility and SEO defect.
  Start sections at `##`.
- **Only `h2` and `h3` appear in the table of contents.** An `h4`-led section
  is unreachable from the sidebar.

---

## How it's put together

```
config/      pipeline.config.js (budgets, caps, gate tiers), thresholds.js
schemas/     JSON Schema contracts — frontmatter, job, verdict
src/
  core/      job lifecycle, state machine, event log, locking, validation
  gates/     one file per quality check, all returning the same verdict shape
  steps/     review → assemble → stage → publish
  adapters/  site.js — the ONLY module that knows the website's layout
  corpus/    in-memory view of published articles + the tool registry
  util/      text metrics, verdict builders, terminal output
data/        runtime state (gitignored): jobs, artifacts, staging
```

Two seams keep this cheap to change later:

- **`adapters/site.js`** is the only file that knows where articles live, how
  the tool registry is shaped, or how to build the site. If the blog moves or
  the frontmatter grows a field, one file changes.
- **`core/store.js`** is an interface over the filesystem. If volume ever
  justifies a database or a queue, one file changes.

A job is a directory under `data/jobs/`. `job.json` holds its state,
`events.jsonl` is an append-only audit trail, and `artifacts/` holds every
intermediate output. Debugging is `cat`, not a query.

### Adding a gate

Write a module exporting `id`, `tier`, and `run(ctx) → Verdict`; register it in
`src/gates/index.js`; list it in a tier in `config/pipeline.config.js`. No step
and no part of the pipeline changes.

---

## Known limits

- **No research step.** The writer is grounded in the tool registry and its own
  knowledge, not external sources. It is explicitly told not to invent
  statistics, but it cannot verify claims about the wider world. Treat factual
  specifics as unverified until the research and external-verification steps
  exist.
- **No separate editorial pass.** Voice is enforced by the writer's prompt and
  the prose gate rather than by a dedicated editor agent.
- **A hand-ingested markdown file can't be auto-revised** — there's no
  structured draft to edit, so it quarantines with an explanation instead. Fix
  the file and re-ingest.
- **Job records accumulate** in `data/jobs/`. Gitignored and small; delete the
  folder for a clean slate.
- **`gh` is required** to open pull requests. Use `--no-pr` without it.
- **Model pricing is a placeholder** — see above.
