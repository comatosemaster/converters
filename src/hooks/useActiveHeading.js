import { useEffect, useRef, useState } from 'react';

// Tracks which of an article's headings is currently "the one being read,"
// for highlighting the matching entry in a sticky table of contents.
//
// IntersectionObserver callbacks only report elements whose intersection
// status just CHANGED, not the full set of what's currently visible - so
// this keeps its own map of every heading's last-known state, and re-picks
// the topmost currently-visible one (in document order) on every change.
//
// Usage: const activeId = useActiveHeading(headingIds);
export function useActiveHeading(headingIds) {
  const [activeId, setActiveId] = useState(headingIds[0] ?? null);
  const intersectingRef = useRef(new Map());

  useEffect(() => {
    if (headingIds.length === 0) return undefined;

    const elements = headingIds.map((id) => document.getElementById(id)).filter(Boolean);
    intersectingRef.current = new Map(elements.map((el) => [el.id, false]));

    function pickActive() {
      const visibleId = headingIds.find((id) => intersectingRef.current.get(id));
      if (visibleId) setActiveId(visibleId);
    }

    // The detection band starts below the sticky header and ends 70% down
    // the viewport - a heading only counts as "current" once it's crossed
    // into the upper portion of the screen a reader is actually looking at.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          intersectingRef.current.set(entry.target.id, entry.isIntersecting);
        });
        pickActive();
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headingIds]);

  return activeId;
}
