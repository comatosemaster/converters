---
title: Why JSON Has No Comments and What to Do Instead
slug: json-comments-alternatives
category: developer
description: Learn why standard JSON rejects comments, what breaks when you add them, and safer ways to document config files, API payloads, and hand-edited data files.
excerpt: Comments in data files are not a harmless editor preference. Here is how to preserve intent without creating files that fail in parsers, CI, or APIs.
tags: [JSON, JSON comments, JSONC, developer tools]
author: Rootconverter
publishDate: 2026-08-08
difficulty: beginner
seoTitle: Why JSON Has No Comments
metaDescription: JSON comments are invalid in standard JSON. Learn why the format has no comments, safer alternatives, JSONC limits, and how to fix files.
relatedTools: [json-formatter-validator, regex-tester, word-counter-text-analyzer]
---

## The short answer: the format leaves comments out on purpose

Standard data files do not allow comments, so `//`, `/* ... */`, and trailing notes make the file invalid.

This is invalid:

```json
{
  "apiUrl": "https://api.example.com",
  // Use staging until launch
  "timeoutMs": 5000
}
```

So is this:

```json
{
  "apiUrl": "https://api.example.com", /* staging */
  "timeoutMs": 5000
}
```

The format was designed as a small data interchange format: strings, numbers, booleans, null, arrays, and objects. Comments were left out so parsers in different languages could agree on the same input without extra rules about which comment styles count, where they can appear, or whether they should be preserved.

That matters because these files are often passed between systems that know nothing about your editor. A file with comments may appear fine in VS Code, then fail in a command-line parser, a browser API, a CI job, or an external service.

The common source of confusion is JavaScript. A JavaScript object literal can sit in a `.js` file next to comments because JavaScript the language supports comments. Data text is not JavaScript source code. It looks similar, but the grammar is stricter.

If you want to check a file before handing it to another system, paste it into the [JSON Formatter, Validator & Fixer](/tool/json-formatter-validator). It runs in your browser, so the data is not uploaded for server-side parsing.

## What usually breaks when you add comments anyway

Commented files tend to fail at the least convenient point: after a teammate pulls the file, after a deployment starts, or after an API request reaches a strict parser.

A parser usually stops near the first character it cannot accept. With comments, that is often a slash:

```json
{
  "region": "eu-west-1",
  // temporary override
  "replicas": 2
}
```

A strict parser may report an error near `/`, `Unexpected token /`, or a similar message. The wording changes by language and library, but the cause is the same: slash characters do not start comments here.

Trailing commas often show up in the same broken files:

```json
{
  "region": "eu-west-1",
  "replicas": 2,
}
```

That final comma is also invalid. When a file contains both comments and trailing commas, people often fix one and miss the other. The file still fails, which makes the error feel random even though both syntax rules are clear.

Shared config files are where this hurts most. One person may have an editor extension that accepts data with comments. Another person may run the same file through a build tool that expects strict input. Both are looking at the same text, but only one tool is being permissive.

Before committing or pasting the file into another system, validate it with the [JSON Formatter, Validator & Fixer](/tool/json-formatter-validator). A validator helps separate real data problems from syntax problems such as stray slashes, trailing commas, missing quotes, and unescaped characters.

## Use data in the file instead of comments

The safest replacement for a comment is often a real field with a clear name. If the consuming application accepts extra keys, make the explanation part of the data instead of hiding it in syntax that the format does not support.

Instead of this invalid file:

```json
{
  "retryCount": 3,
  // Increase during migration week
  "timeoutMs": 8000
}
```

Use explicit data:

```json
{
  "retryCount": 3,
  "timeoutMs": 8000,
  "timeoutReason": "Higher timeout during migration week"
}
```

Common field names include:

- `description` for human-readable context
- `note` for a short explanation
- `label` for UI-friendly names
- `source` for where the value came from
- `enabled` for toggling behavior without deleting data
- `owner` for the team or system responsible for a setting

For example:

```json
{
  "features": [
    {
      "key": "newCheckout",
      "enabled": false,
      "description": "Disabled until payment provider testing is complete",
      "owner": "payments-team"
    }
  ]
}
```

This works well for configuration that humans read and software consumes. The meaning travels with the value through formatting, copying, sorting, and machine processing. A property called `description` survives in a way that a comment does not.

The tradeoff is schema compatibility. If the application rejects unknown keys, adding `description` or `note` may break the file as surely as a comment would. Some APIs and config loaders ignore extra fields; others reject them. Check the schema or documentation before adding metadata fields.

A short property name is usually better than a long explanatory paragraph. If you need several sentences to explain one setting, that explanation probably belongs in separate documentation rather than inside the object.

## Keep comments outside the file when it is machine-only

If the data is generated, exchanged with an API, or consumed by tools you do not control, keep human notes outside the file. The file should stay strict, predictable, and easy for any parser to read.

Good places for notes include:

- A `README.md` in the same directory
- An adjacent file such as `config.md`
- A changelog that explains why values changed
- An issue tracker ticket linked from the project docs
- Documentation in the code that loads or generates the file

A useful pattern is pairing the machine file with a human file:

```text
config.json
config.md
```

The data stays valid:

```json
{
  "timeoutMs": 8000,
  "retryCount": 3,
  "region": "eu-west-1"
}
```

The Markdown explains intent:

```markdown
# Config notes

- `timeoutMs` is higher during the migration window.
- `retryCount` should stay at 3 unless the API provider changes its rate limits.
- `region` must match the deployment region used by the worker service.
```

This pattern is boring, and that is the point. APIs, build tools, scripts, and validators all receive clean data. Humans still have a place to record why the values exist.

Do not push important meaning into filenames or directory names if the next person still has to open the file to understand it. A name like `config-new-final-prod.json` is not documentation; it is a future guessing game.

If you are writing the companion documentation by hand, the [Word Counter & Text Analyzer](/tool/word-counter-text-analyzer) can help keep notes concise enough that people will read them.

## If you control the parser, JSONC is the compromise

JSONC means “JSON with comments.” It is a comment-tolerant variant used by some editors and developer tools. In practice, it lets you write data-like files with comments, and sometimes with other relaxed syntax depending on the parser.

Example:

```json
{
  // Used by local development only
  "apiBaseUrl": "http://localhost:3000",
  "logLevel": "debug"
}
```

That may be fine inside a controlled toolchain. For example, a specific editor, build tool, or application may document that it reads JSONC rather than strict data text. In that case, comments are part of the tool’s expected input format.

The risk starts when the file leaves that controlled environment. A JSONC file sent to an API endpoint, passed to a generic parser, or copied into a service dashboard may fail because the receiver expects standard input. The file looks like the format to a human, but it is not valid text for every consumer.

Treat JSONC as an authoring format, not a portable interchange format. If the file must be distributed, published, or sent to another system, strip comments and produce strict output first. That keeps the relaxed syntax local to the tool that understands it.

Do not use JSONC for files that must work across unknown parsers. If you cannot name the exact parser that will read the file, assume strict input.

A practical workflow is to edit the JSONC source, generate or copy out strict output, then validate the result with the [JSON Formatter, Validator & Fixer](/tool/json-formatter-validator) before using it elsewhere.

## When the format is the wrong choice entirely

If a file needs many notes, ordering guidance, examples, anchors, or long explanations, the format may be the wrong container for that job.

It is good for structured data exchange. It is less pleasant as a hand-authored document format. Deeply nested objects, repeated keys, and long string values become hard to scan, especially when the missing comments are trying to explain business rules or operational decisions.

A concrete decision rule helps: if the comments are doing more work than the data, the format is fighting the task.

For a config file maintained by people, a different format may fit better if the consuming system supports it. YAML is commonly used for human-edited configuration because it supports comments and has a lighter visual style. Some projects also define their own documented config formats, or use formats designed around a specific tool.

The catch is compatibility. Changing formats only helps if every tool in the chain can read the replacement format. If one deployment script, API, package, or library requires this format, then switching to YAML creates a conversion step or a new failure point.

A safe approach is to separate authoring from output. Keep a human-friendly source file if your toolchain supports it, then generate strict data for systems that require it. After generation, run the result through the [JSON Formatter, Validator & Fixer](/tool/json-formatter-validator) so the final artifact is clean.

## A quick workflow for fixing a commented file

Start by removing the comment syntax, not the meaning. The goal is valid data that still tells future readers enough to avoid mistakes.

1. Delete `//` and `/* ... */` comment markers.
2. Move short explanations into accepted fields such as `description`, `note`, `source`, or `owner`.
3. Move longer explanations into `README.md`, `config.md`, or the code that loads the file.
4. Remove trailing commas after the last property or array item.
5. Validate the final file.

For example, turn this:

```json
{
  "cacheTtlSeconds": 300, // Keep low while testing invalidation
}
```

Into this, if extra fields are allowed:

```json
{
  "cacheTtlSeconds": 300,
  "cacheTtlNote": "Kept low while testing invalidation"
}
```

Then check it with the [JSON Formatter, Validator & Fixer](/tool/json-formatter-validator). Look for trailing commas, stray slashes, broken quoting, and values that accidentally became strings or numbers during editing.

If the data is embedded as a string inside another system, validate the inner content separately. The outer layer may escape quotes, backslashes, or newlines differently, so a valid-looking blob can still fail when extracted and parsed.