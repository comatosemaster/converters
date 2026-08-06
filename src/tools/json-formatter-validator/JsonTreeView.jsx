import { useState } from 'react';

// A cap on how deep the tree will actually render - protects against a
// pathologically deep JSON document blowing the call stack or rendering
// millions of nested elements. Matches the cap used for stats in
// jsonUtils.js.
const MAX_RENDER_DEPTH = 500;

function describeNode(value) {
  if (Array.isArray(value)) return { kind: 'array', count: value.length };
  if (value !== null && typeof value === 'object') return { kind: 'object', count: Object.keys(value).length };
  return { kind: value === null ? 'null' : typeof value, text: JSON.stringify(value) };
}

function entriesOf(kind, value) {
  return kind === 'array' ? value.map((item, index) => [index, item]) : Object.entries(value);
}

// Renders like real, syntax-highlighted JSON (quoted keys, colored
// brackets, trailing commas between siblings) rather than a plain
// "Object(3)" label - that's what makes it read as colorful at a glance,
// not just on individual leaf values once you dig in.
function JsonTreeNode({ label, value, depth, path, expandedPaths, onToggle, isLast }) {
  const description = describeNode(value);
  const { kind } = description;
  const isExpandable = kind === 'object' || kind === 'array';

  const keyPrefix = label !== null && (
    <>
      <span className="json-tree-key">&quot;{label}&quot;</span>
      <span className="json-tree-punctuation">: </span>
    </>
  );
  const comma = !isLast && <span className="json-tree-punctuation">,</span>;

  if (!isExpandable) {
    return (
      <div className="json-tree-row">
        {keyPrefix}
        <span className={`json-tree-value json-tree-${kind}`}>{description.text}</span>
        {comma}
      </div>
    );
  }

  if (depth > MAX_RENDER_DEPTH) {
    return (
      <div className="json-tree-row">
        {keyPrefix}
        <span className="json-tree-value">… (too deeply nested to display)</span>
        {comma}
      </div>
    );
  }

  const openBracket = kind === 'array' ? '[' : '{';
  const closeBracket = kind === 'array' ? ']' : '}';
  const isExpanded = expandedPaths.has(path);

  if (!isExpanded) {
    return (
      <div className="json-tree-row">
        <button type="button" className="json-tree-toggle" onClick={() => onToggle(path)} aria-expanded={false}>
          <span className="json-tree-arrow" aria-hidden="true">▸</span>
          {keyPrefix}
          <span className="json-tree-bracket">{openBracket}</span>
          <span className={`json-tree-badge json-tree-badge-${kind}`}>{description.count}</span>
          <span className="json-tree-bracket">{closeBracket}</span>
        </button>
        {comma}
      </div>
    );
  }

  const entries = entriesOf(kind, value);

  return (
    <div className="json-tree-branch">
      <button type="button" className="json-tree-toggle" onClick={() => onToggle(path)} aria-expanded>
        <span className="json-tree-arrow expanded" aria-hidden="true">▸</span>
        {keyPrefix}
        <span className="json-tree-bracket">{openBracket}</span>
      </button>
      <div className="json-tree-children">
        {entries.map(([key, childValue], index) => (
          <JsonTreeNode
            key={key}
            label={kind === 'array' ? null : key}
            value={childValue}
            depth={depth + 1}
            path={`${path}.${key}`}
            expandedPaths={expandedPaths}
            onToggle={onToggle}
            isLast={index === entries.length - 1}
          />
        ))}
      </div>
      <div className="json-tree-row">
        <span className="json-tree-bracket">{closeBracket}</span>
        {comma}
      </div>
    </div>
  );
}

// Collects every expandable node's path under `value`, for "Expand all".
function collectExpandablePaths(value, path, depth, paths) {
  if (depth > MAX_RENDER_DEPTH) return;
  const { kind } = describeNode(value);
  if (kind !== 'object' && kind !== 'array') return;

  paths.push(path);
  entriesOf(kind, value).forEach(([key, childValue]) => {
    collectExpandablePaths(childValue, `${path}.${key}`, depth + 1, paths);
  });
}

// Expands the root plus one level below it by default, so the tree opens
// already showing real colored keys/values instead of a single collapsed
// "{ 12 }" row the user has to click into before any color is visible.
function getDefaultExpandedPaths(value) {
  const paths = new Set(['root']);
  const { kind } = describeNode(value);
  if (kind === 'object' || kind === 'array') {
    entriesOf(kind, value).forEach(([key, childValue]) => {
      const childKind = describeNode(childValue).kind;
      if (childKind === 'object' || childKind === 'array') paths.add(`root.${key}`);
    });
  }
  return paths;
}

// An expandable/collapsible view of a parsed JSON value, with Expand
// all / Collapse all controls. `data` should already be valid (the caller
// only renders this once JSON.parse has succeeded).
export default function JsonTreeView({ data }) {
  const [expandedPaths, setExpandedPaths] = useState(() => getDefaultExpandedPaths(data));

  function handleToggle(path) {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleExpandAll() {
    const paths = [];
    collectExpandablePaths(data, 'root', 0, paths);
    setExpandedPaths(new Set(paths));
  }

  function handleCollapseAll() {
    setExpandedPaths(new Set());
  }

  return (
    <div className="json-tree-view">
      <div className="mode-toggle">
        <button type="button" className="mode-button" onClick={handleExpandAll}>
          Expand all
        </button>
        <button type="button" className="mode-button" onClick={handleCollapseAll}>
          Collapse all
        </button>
      </div>
      <div className="json-tree-root">
        <JsonTreeNode
          label={null}
          value={data}
          depth={0}
          path="root"
          expandedPaths={expandedPaths}
          onToggle={handleToggle}
          isLast
        />
      </div>
    </div>
  );
}
