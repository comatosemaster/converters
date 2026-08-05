// -----------------------------------------------------------------------
// THE TOOL REGISTRY
// -----------------------------------------------------------------------
// This file is the single source of truth for every tool on the site.
// The homepage, the header navigation, and the /tool/:id route all read
// from the `tools` array below — nothing else needs to change when you
// add a new tool.
//
// See README.md for the step-by-step "how to add a new tool" recipe.
// -----------------------------------------------------------------------

import Base64Tool from './base64/Base64Tool.jsx';

// The five fixed categories every tool must belong to. `id` is used in
// URLs and as a React key, `name` is what gets displayed on screen.
export const CATEGORIES = [
  { id: 'graphics-media', name: 'Graphics & Media' },
  { id: 'text-data', name: 'Text & Data' },
  { id: 'business-finance', name: 'Business & Finance' },
  { id: 'developer', name: 'Developer' },
  { id: 'everyday', name: 'Everyday' },
];

// One object per tool. To add a new tool:
//   1. Create src/tools/<your-tool>/<YourTool>.jsx
//   2. Import it below
//   3. Add an entry to this array
// That's it — the tool automatically shows up on the homepage, in the
// nav, and becomes reachable at /tool/<id>.
export const tools = [
  {
    id: 'base64-encoder-decoder',
    name: 'Base64 Encoder / Decoder',
    description: 'Encode plain text into Base64, or decode Base64 back into readable text.',
    category: 'text-data',
    icon: '🔤',
    component: Base64Tool,
  },
];

// Groups `tools` by category, in the same order as CATEGORIES, so the
// homepage can just loop over the result. Categories with no tools yet
// are still included (with an empty list) so they always appear.
export function getToolsByCategory() {
  return CATEGORIES.map((category) => ({
    ...category,
    tools: tools.filter((tool) => tool.category === category.id),
  }));
}

// Looks up a single tool by its id. Returns undefined if not found, which
// ToolPage.jsx treats as "show a not-found message."
export function getToolById(id) {
  return tools.find((tool) => tool.id === id);
}
