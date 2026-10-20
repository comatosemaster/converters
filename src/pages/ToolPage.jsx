import { useParams } from 'react-router-dom';
import { getCategoryById, getRelatedTools, getToolById } from '../tools/registry.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { useCurrentRoute } from '../hooks/useCurrentRoute.js';
import ToolLayout from '../components/ToolLayout.jsx';
import NotFound from './NotFound.jsx';

// Renders whichever tool matches the :id in the URL. This file never needs
// to change when a new tool is added - it looks the id up in the registry
// and wraps the result in the shared ToolLayout, which supplies the
// breadcrumbs, header, and related-tools section for free.
//
// Its metadata (title, description, canonical, structured data) and its
// breadcrumb trail come from the route registry (src/seo/routes.js), which
// derives them from the tool's registry entry. The same entry is what the
// build prerenders and what the sitemap lists.

export default function ToolPage() {
  const { id } = useParams();
  const tool = getToolById(id);
  const category = tool ? getCategoryById(tool.category) : null;
  const route = useCurrentRoute();

  // Hooks must run on every render, so this is called before the early
  // return for an unknown id.
  useDocumentMeta(route);

  if (!tool || !route) {
    return <NotFound />;
  }

  const ToolComponent = tool.component;

  return (
    <ToolLayout
      tool={tool}
      category={category}
      relatedTools={getRelatedTools(tool.id)}
      // The same array the route registry marks up as BreadcrumbList, so
      // the visible trail and the structured data can never disagree.
      breadcrumbs={route.breadcrumbs}
    >
      <ToolComponent />
    </ToolLayout>
  );
}
