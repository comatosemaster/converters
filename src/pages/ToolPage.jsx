import { useParams } from 'react-router-dom';
import { getCategoryById, getRelatedTools, getToolById } from '../tools/registry.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { toolMeta } from '../seo/buildMeta.js';
import { breadcrumbSchema, toolSchema } from '../seo/structuredData.js';
import ToolLayout from '../components/ToolLayout.jsx';
import NotFound from './NotFound.jsx';

// Renders whichever tool matches the :id in the URL. This file never needs
// to change when a new tool is added - it looks the id up in the registry
// and wraps the result in the shared ToolLayout, which supplies the
// breadcrumbs, header, and related-tools section for free.
//
// It is also the ONLY place tool page metadata is set. Tool components
// used to each call useDocumentMeta themselves, which meant 28 copies of
// the same concern, no way to audit titles for length or uniqueness, and
// nothing to generate a sitemap from. Everything now derives from the
// registry entry (see src/seo/buildMeta.js).

export default function ToolPage() {
  const { id } = useParams();
  const tool = getToolById(id);
  const category = tool ? getCategoryById(tool.category) : null;

  // Breadcrumbs are built once and used twice: rendered visibly by
  // ToolLayout, and marked up as BreadcrumbList below. Deriving both from
  // the same array is what keeps the structured data honest - it can't
  // describe a trail the page doesn't actually show.
  const breadcrumbs = tool
    ? [
        { label: 'Home', to: '/' },
        ...(category ? [{ label: category.name, to: `/category/${category.id}` }] : []),
        { label: tool.name },
      ]
    : [];

  const meta = tool ? toolMeta(tool, category) : null;

  // Hooks must run on every render, so this is computed before the early
  // return for an unknown id.
  useDocumentMeta(
    meta
      ? { ...meta, jsonLd: [toolSchema(tool, category), breadcrumbSchema(breadcrumbs)] }
      : { title: '', description: '' },
  );

  if (!tool) {
    return <NotFound />;
  }

  const ToolComponent = tool.component;

  return (
    <ToolLayout
      tool={tool}
      category={category}
      relatedTools={getRelatedTools(tool.id)}
      breadcrumbs={breadcrumbs}
    >
      <ToolComponent />
    </ToolLayout>
  );
}
