# Using the pipeline

A walkthrough with real commands and real output. For *what it is* see
[README.md](README.md); for *why it's built this way* see
[the architecture doc](../docs/content-pipeline-architecture.md).

Every command below is run from the repo root.

---

## 1. Try it with no API key (2 minutes)

`--mock` swaps in a built-in fake model: no network, no cost, no key. The
entire pipeline runs, so this is the fastest way to see the shape of things.

```bash
npm run pipeline -- topic "What Base64 encoding does and when to avoid it" --mock
```

```
Created job 2026-08-07-what-base64-encoding-does-and-when-a1b2
  topic: What Base64 encoding does and when to avoid it

Next: npm run pipeline -- run 2026-08-07-what-base64-encoding-does-and-when-a1b2 --mock
```

Copy that job id and run it:

```bash
npm run pipeline -- run <job-id> --mock --dry-run
```

```
→ outline (mock)…
→ draft (mock)…
→ review…

  frontmatter  pass  2 warnings
    ! Meta description is 116 characters; target 120-160. (metaDescription)
      → Expand it to make fuller use of the search snippet.

  links  pass
  markdown  pass  1 warning
  dedup  pass
  prose  pass

✓ All gates passed.
→ assemble…
→ stage…
→ publish…

Dry run: would commit src\content\blog\what-base64-encoding-does.md on branch content/…
```

`--dry-run` stops short of git. Drop it and it opens a real pull request.

> **Note** — the mock writes placeholder prose. It exists to exercise the
> plumbing, not to produce anything publishable. The staged `.md` file is left
> in `src/content/blog/`; delete it when you're done experimenting.

---

## 2. Set up for real

```bash
cp content-pipeline/.env.example .env
```

Open `.env` (at the **repo root**, not inside `content-pipeline/`) and add your
key from [console.anthropic.com](https://console.anthropic.com/settings/keys):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Check it:

```bash
npm run pipeline -- doctor
```

```
Configuration

  provider           anthropic
  ANTHROPIC_API_KEY  set
  tool registry      28 tools, 6 categories
  published          0 articles
```

`.env` is gitignored. Don't commit it.

---

## 3. Write your first real article

```bash
npm run pipeline -- topic "Why JSON has no comments, and what to do instead"
npm run pipeline -- run <job-id>
```

The run does this, stopping if anything fails:

| Step | What happens | Model |
| --- | --- | --- |
| `outline` | Topic → structure, sections, target keywords, which tools to link | standard |
| `draft` | Outline → the actual article | frontier |
| `review` | Five deterministic gates | none |
| `revise` | Fixes whatever the gates flagged, then re-reviews | standard |
| `assemble` | Structured data → the final `.md` | none |
| `stage` | Writes into `src/content/blog/`, runs the **real site build** | none |
| `publish` | Branch, commit, open a pull request | none |

Then **you merge the PR**, which is what actually deploys it. Nothing reaches
the live site without that.

Expect roughly a minute, and check the cost line at the end:

```
Cost: $0.14 for this article.
```

### Review it before merging

The PR diff is the article. Read it like you'd read anyone's draft — the gates
check that it's structurally sound and doesn't reference things that don't
exist, but they can't tell you whether it's *good*, or whether a factual claim
about the wider world is true.

---

## 4. Publishing an article you wrote yourself

The AI is optional. To use the pipeline purely as a safety net:

```bash
npm run pipeline -- check drafts/my-article.md
```

Runs every gate, prints findings with fixes, exits 0 or 1. No job, no side
effects, no model. Good for a pre-commit hook.

To actually publish it:

```bash
npm run pipeline -- ingest drafts/my-article.md
npm run pipeline -- run <job-id>
```

Start from [`src/content/blog/_TEMPLATE.md`](../src/content/blog/_TEMPLATE.md),
which documents every frontmatter field.

> **Warning** — a hand-written article can't be auto-revised (there's no
> structured draft for the reviser to edit safely). If gates fail, fix the file
> and re-ingest.

---

## 5. Reading job state

```bash
npm run pipeline -- jobs                    # everything
npm run pipeline -- jobs --state quarantined
npm run pipeline -- status <job-id>         # state, verdicts, cost, artifacts
npm run pipeline -- status <job-id> --verbose   # + full event history
```

Every job is a plain directory you can read directly:

```
content-pipeline/data/jobs/<job-id>/
├── job.json          current state
├── events.jsonl      every transition, model call, token count, cost
└── artifacts/
    ├── topic.json
    ├── outline.json
    ├── draft.json / draft.md
    ├── review.json, review.v2.json     one per round
    ├── revised.v2.json / .md           one per revision
    └── article.md                      what actually ships
```

Nothing is overwritten, so you can diff exactly what a revision changed:

```bash
npm run pipeline -- artifacts <job-id>                  # list
npm run pipeline -- artifacts <job-id> review.json      # print one
```

---

## 6. What the states mean

```bash
npm run pipeline -- states
```

The ones you'll actually see:

| State | Meaning | Do |
| --- | --- | --- |
| `drafted` | Article written, unreviewed | `run` it |
| `reviewed` | Gates ran, verdict recorded | `run` continues automatically |
| `staged` | Written to the site, build verified | `run` to open the PR |
| `published` | PR opened | Merge it |
| `quarantined` | Needs you | See below |

**`quarantined` is not a crash.** It means the system correctly decided a human
should look. `status` tells you why.

---

## 7. Troubleshooting

### "Gate X has failed 2 revisions in a row. It is not converging."

The reviser tried twice and the gate still fails. Usually the article has a
problem the reviser can't fix from the finding alone.

```bash
npm run pipeline -- status <job-id>          # see the findings
npm run pipeline -- artifacts <job-id> revised.v3.md   # read the latest attempt
```

Either fix it by hand and re-ingest, or start over with a sharper topic. Raise
`revisions.maxPerGate` in `config/pipeline.config.js` only if you think it was
genuinely close.

### "Revisions stopped improving"

The oscillation guard. Error count didn't fall across consecutive rounds — the
model is fixing one gate while breaking another. More attempts would waste
money. Rewrite the topic or fix by hand.

### "The site build failed with this article in place"

Something in the markdown breaks the real build. The article was **removed
again**, so your working tree is clean.

```bash
npm run pipeline -- artifacts <job-id> build.json
```

Usually an unclosed code fence or a frontmatter value that trips the parser.

### "relatedTools references X, which is not a tool on this site"

The model invented a tool. This is the most common real failure, and it's why
the links gate exists — every id is checked against `src/tools/registry.js`.
The reviser normally fixes it on the first pass.

### "ANTHROPIC_API_KEY is not set"

`.env` goes at the **repo root**, not in `content-pipeline/`. Check with
`doctor`. Or use `--mock`.

### "The GitHub CLI (`gh`) is required"

Install `gh` and run `gh auth login`, or use `--no-pr` to commit to a branch
without opening a PR.

### "Daily publish cap reached"

Deliberate. Publishing more than a few articles a day is the pattern search
engines read as scaled content abuse. Raise `publish.maxPerDay` in
`config/pipeline.config.js` if you really mean to.

### "Job is locked by a running process"

Another run is working on it. If a previous run was killed, the stale lock is
detected automatically — just re-run.

---

## 8. Running one step at a time

`run` advances as far as it can. To go step by step:

```bash
npm run pipeline -- step <job-id> outline
npm run pipeline -- step <job-id> draft
npm run pipeline -- step <job-id> review
```

Useful when tuning a prompt: re-run `draft` alone and re-review, without
redoing the outline.

Stop at a specific point:

```bash
npm run pipeline -- run <job-id> --to staged     # everything except the PR
```

---

## 9. Tuning it

| Want to change | Edit |
| --- | --- |
| Voice, banned phrases, structure rules | `config/house-style.md` |
| How an agent thinks | `prompts/<agent>/v1.md` |
| Which model each tier uses | `config/models.js` |
| Gate strictness (word counts, thresholds) | `config/thresholds.js` |
| Revision budget, publish caps, gate tiers | `config/pipeline.config.js` |

Two things worth knowing before you edit:

- **`config/house-style.md` and `src/gates/prose.gate.js` must agree.** The gate
  rejects what the style file forbids. If they disagree, every article burns a
  revision cycle fixing something the prompt told it to do.
- **Prompts are versioned.** To change one meaningfully, copy `v1.md` to
  `v2.md` and edit that. The loader picks the highest version, `v1` stays as a
  rollback, and each job records which version wrote it — so if quality drops,
  you can tell what changed.

---

## 10. Useful flags

| Flag | Effect |
| --- | --- |
| `--mock` | Fake model. No network, no cost. |
| `--dry-run` | Publish step reports what it would do, changes nothing. |
| `--no-pr` | Commit to a branch without opening a PR. |
| `--skip-build` | Skip the site build when staging. Faster, less safe. |
| `--verbose` | Include informational findings and event history. |
| `--json` | Machine-readable output. |
| `DEBUG=1` | Full error details instead of a one-line message. |

---

## 11. Starting fresh

Job data is disposable and gitignored:

```bash
rm -rf content-pipeline/data/jobs
```

If a staged article is left in `src/content/blog/` from an experiment, delete
that file too — the pipeline won't overwrite an existing slug, so a leftover
will block a real run later.
