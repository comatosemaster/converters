import { useParams } from 'react-router-dom';
import { getCategoryById, getRelatedTools, getToolById } from '../tools/registry.js';
import ToolLayout from '../components/ToolLayout.jsx';
import NotFound from './NotFound.jsx';

// Renders whichever tool matches the :id in the URL. This file never needs
// to change when a new tool is added - it just looks the id up in the
// registry and wraps the result in the shared ToolLayout, which supplies
// the breadcrumbs, header, and related-tools section for free.

export default function ToolPage() {
  const { id } = useParams();
  const tool = getToolById(id);

  if (!tool) {
    return <NotFound />;
  }

  const ToolComponent = tool.component;

  return (
    <ToolLayout
      tool={tool}
      category={getCategoryById(tool.category)}
      relatedTools={getRelatedTools(tool.id)}
    >
      <ToolComponent />
    </ToolLayout>
  );
}
