// -----------------------------------------------------------------------
// GATE: frontmatter  (Tier 0 - deterministic, free)
//
// Two layers of checking, because they fail for different reasons:
//
//   1. SHAPE - validated against schemas/frontmatter.schema.json. Is this
//      the right set of fields, of the right types, within sane lengths?
//
//   2. MEANING - checked against live repo state. Does this category
//      actually exist? Is this slug already taken? Those can't live in a
//      JSON Schema because the answer changes as the repo changes.
//
// A model inventing a plausible-but-nonexistent category is a routine
// failure mode, and it produces an article that renders under a category
// page that doesn't exist. Cheap to catch here, confusing to debug later.
// -----------------------------------------------------------------------

import { validate } from '../core/validate.js';
import { buildVerdict, error, warn } from '../util/verdict.js';
import { thresholds } from '../../config/thresholds.js';

export const id = 'frontmatter';
export const tier = 0;

export async function run({ frontmatter, slug, corpus }) {
  const findings = [];

  // --- Layer 1: shape ---------------------------------------------------
  const { ok, errors } = await validate('frontmatter.schema.json', frontmatter);
  if (!ok) {
    for (const item of errors) {
      findings.push(
        error('frontmatter.schema', item.message, {
          location: { field: item.field },
          fixHint: 'Correct this field in the article frontmatter. See src/content/blog/_TEMPLATE.md for the full schema.',
        }),
      );
    }
  }

  // --- Layer 2: meaning -------------------------------------------------

  if (frontmatter.category && !corpus.categoryIds.has(frontmatter.category)) {
    findings.push(
      error(
        'frontmatter.category.unknown',
        `Category "${frontmatter.category}" does not exist.`,
        {
          location: { field: 'category' },
          fixHint: `Use one of: ${[...corpus.categoryIds].join(', ')}.`,
        },
      ),
    );
  }

  if (slug && corpus.slugs.has(slug)) {
    findings.push(
      error('frontmatter.slug.duplicate', `An article with slug "${slug}" already exists.`, {
        location: { field: 'slug' },
        fixHint: 'Choose a different slug, or update the existing article instead of publishing a second one.',
      }),
    );
  }

  // The frontmatter's own `slug` (when present) must match the filename,
  // or the file and its URL disagree - blogUtils.js keys off `slug`, so
  // the article would be reachable at a URL that doesn't match its file.
  if (frontmatter.slug && slug && frontmatter.slug !== slug) {
    findings.push(
      error(
        'frontmatter.slug.mismatch',
        `Frontmatter slug "${frontmatter.slug}" does not match the filename "${slug}.md".`,
        { location: { field: 'slug' }, fixHint: 'Make the filename and the frontmatter slug identical.' },
      ),
    );
  }

  // --- Soft SEO checks (warnings only) ----------------------------------

  const seoTitle = frontmatter.seoTitle || frontmatter.title || '';
  if (seoTitle.length > thresholds.seo.titleMax) {
    findings.push(
      warn(
        'frontmatter.seoTitle.long',
        `SEO title is ${seoTitle.length} characters; search results truncate around ${thresholds.seo.titleMax}.`,
        { location: { field: 'seoTitle' }, fixHint: `Shorten to under ${thresholds.seo.titleMax} characters.` },
      ),
    );
  }

  const metaDescription = frontmatter.metaDescription || frontmatter.description || '';
  if (metaDescription.length > thresholds.seo.metaDescriptionMax) {
    findings.push(
      warn(
        'frontmatter.metaDescription.long',
        `Meta description is ${metaDescription.length} characters; target ${thresholds.seo.metaDescriptionMin}-${thresholds.seo.metaDescriptionMax}.`,
        { location: { field: 'metaDescription' }, fixHint: 'Trim it without losing the primary keyword.' },
      ),
    );
  } else if (metaDescription.length < thresholds.seo.metaDescriptionMin) {
    findings.push(
      warn(
        'frontmatter.metaDescription.short',
        `Meta description is ${metaDescription.length} characters; target ${thresholds.seo.metaDescriptionMin}-${thresholds.seo.metaDescriptionMax}.`,
        { location: { field: 'metaDescription' }, fixHint: 'Expand it to make fuller use of the search snippet.' },
      ),
    );
  }

  if (!frontmatter.tags || frontmatter.tags.length === 0) {
    findings.push(
      warn('frontmatter.tags.missing', 'No tags set; tags feed blog search.', {
        location: { field: 'tags' },
        fixHint: 'Add 3-5 tags describing the topic.',
      }),
    );
  }

  if (frontmatter.publishDate) {
    const published = new Date(frontmatter.publishDate);
    // Tomorrow, not today, so an article dated "today" in a timezone ahead
    // of this machine isn't flagged for a difference of a few hours.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (published > tomorrow) {
      findings.push(
        warn(
          'frontmatter.publishDate.future',
          `publishDate ${frontmatter.publishDate} is in the future; the article will look newer than it is.`,
          { location: { field: 'publishDate' } },
        ),
      );
    }
  }

  return buildVerdict(id, findings);
}
