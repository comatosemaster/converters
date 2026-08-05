// A small wrapper that gives every tool the same look: a title, a
// description, and a content area. ToolPage.jsx applies this automatically
// around whichever tool component is being shown, so individual tool files
// (like Base64Tool.jsx) never need to import or think about this — they
// just focus on their own inputs/outputs/logic.

export default function ToolLayout({ title, description, children }) {
  return (
    <section className="tool">
      <header className="tool-header">
        <h1>{title}</h1>
        {description && <p className="tool-description">{description}</p>}
      </header>
      <div className="tool-content">{children}</div>
    </section>
  );
}
