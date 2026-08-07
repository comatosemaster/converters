# Content pipeline

Validates, stages, build-verifies, and PR-publishes blog articles for Rootconverter.

**Phase 1 — no AI yet.** Everything here is deterministic. There are no model
calls, no API keys, and nothing to configure before using it. Today it is a
strict linter and a safe publishing path for articles you write by hand; phases
2-4 add the agents that write them. See
[`docs/content-pipeline-architecture.md`](../docs/content-pipeline-architecture.md)
for the full design.

---

## Quick start

Check an article you wrote:

```bash
npm run pipeline -- check path/to/article.md
```

That runs every quality gate and prints what's wrong, with a suggested fix for
each finding. Exit code is 0 if it would be publishable, 1 otherwise — so it
drops straight into a pre-commit hook or CI later.

Publish one:

```bash
npm run pipeline -- ingest path/to/article.md   # → prints a job id
npm run pipeline -- run <job-id>
```

That validates it, writes it into `src/content/blog/`, runs the **real site
build** to confirm it renders, then opens a pull request. Merging the PR
deploys it.

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
| `check <file.md>` | Run all gates against a file. No job, no side effects. |
| `ingest <file.md>` | Create a job from a file. |
| `run <job-id>` | Advance the job as far as it can go. |
| `step <job-id> <step>` | Run exactly one step. |
| `status <job-id>` | State, latest verdicts, artifacts. Add `--verbose` for full history. |
| `jobs` | List jobs. `--state staged` to filter. |
| `artifacts <job-id> [name]` | List artifacts, or print one. |
| `quarantine <job-id> [reason]` | Park a job for human attention. |
| `abandon <job-id>` | Drop a job. |
| `gates` / `states` | Show the configured gates / the state graph. |

Useful flags: `--dry-run` (publish: show what would happen, change nothing),
`--no-pr` (commit to a branch without opening a PR), `--skip-build` (faster
staging, less safe), `--json`, `--verbose`.

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

## Known limits (phase 1)

- **No AI.** By design — phases 2-4.
- **No revision loop.** If gates find problems, fix the source file and
  re-ingest. The automated reviser arrives in phase 3.
- **Job records accumulate** in `data/jobs/`. It's gitignored and small;
  delete the folder when you want a clean slate.
- **`gh` is required** to open pull requests. Use `--no-pr` without it.
