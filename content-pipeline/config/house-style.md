<!--
  Shared voice specification, injected into the outliner, writer, and
  reviser prompts by the prompt loader.

  Defined once, here, rather than restated in each prompt - three copies
  of a style guide drift apart within a month, and then articles written
  by different agents stop sounding like the same site.

  IMPORTANT: this file and src/gates/prose.gate.js must agree. The gate
  rejects what this file forbids. If they disagree, every article gets
  flagged and burns revision budget fixing something the prompt told it
  to do.
-->

## Voice

Write like a knowledgeable colleague explaining something at a desk, not like
marketing copy and not like a textbook. The reader has a job to do and landed
here from a search; respect that.

- Lead with the answer. Do not warm up.
- Prefer concrete over abstract. "A 2MB photo becomes 2.7MB" beats "significant
  size overhead".
- Say when something is a bad idea. Articles that only list benefits read as
  advertising and are less useful.
- Second person ("you") for instructions. Never "we" for the reader.
- Contractions are fine. Formality is not the goal; clarity is.

## Never write these

They are automatically rejected by the prose gate, so using them costs a
revision cycle:

- "In today's digital landscape / world / age"
- "It is important to note that", "It is worth noting that"
- "In conclusion", "Last but not least", "Needless to say"
- "When it comes to", "Due to the fact that", "At the end of the day"
- "Delve into", "Unlock the power of", "Navigate the world of"
- "In this article, we will…"

Also avoid piling up vague qualifiers: *very, really, quite, basically,
essentially, actually, simply, just*. One occasionally is fine; a page full
reads as padding.

Vary how sentences begin. Three consecutive sentences opening with the same
word is flagged.

## Structure

- No `#` heading in the body. The page renders its `h1` from the title.
  Sections start at `##`.
- Only `##` and `###` appear in the table of contents. Do not go deeper.
- Every section heading must be distinct.
- Aim for 900-1800 words unless the topic genuinely needs more.

## Formatting

- Code fences must declare a language: ` ```js `, ` ```json `, ` ```bash `.
  Use ` ```text ` for plain output.
- Images need alt text.
- Callouts use GitHub syntax and should be rare - at most two per article:
  `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, each followed by a blank `>` line.
- Tables are good for comparisons. Do not use one for a two-item list.

## Linking

- Link to the site's own tools with site-absolute paths:
  `[Base64 Encoder / Decoder](/tool/base64-encoder-decoder)`.
- **Only ever link to tool ids that appear in the provided tool list.** A link
  to a tool that does not exist is a 404 and is automatically rejected.
- At least one tool link per article, placed where a reader would actually
  want it - at the point they'd want to try the thing, not bolted to the end.
- Do not invent statistics, benchmarks, dates, or version numbers. If a
  specific figure isn't known, describe the shape of it instead.
