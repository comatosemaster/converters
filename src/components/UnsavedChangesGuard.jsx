import { useBlocker } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog.jsx';

// Shows our OWN styled "leave without saving?" dialog when the user tries
// to navigate to a different page inside the site (clicking another tool,
// going back, etc.) while they have unsaved work.
//
// This is different from — and works alongside — useUnsavedChangesWarning:
//   - useUnsavedChangesWarning covers closing the tab / refreshing / typing
//     a new URL. Browsers force their own plain dialog for that, with no
//     way to restyle it — that's a deliberate browser security rule, so a
//     site can't fake a scarier-looking system prompt.
//   - UnsavedChangesGuard (this component) covers navigating to a DIFFERENT
//     PAGE WITHIN OUR OWN SITE. Since that's just our React app swapping
//     what it renders (not a real page unload), we're free to show
//     whatever confirmation UI we want — so we do.
//
// Note: this only catches navigation to a different PAGE. A button inside
// a tool that resets its own state (like "choose a different image")
// doesn't navigate anywhere, so it needs its own confirmation — see
// ConfirmDialog.jsx, which this component's dialog is also built from.
//
// Usage: render this once in a tool's JSX, passing the same boolean you
// already give useUnsavedChangesWarning:
//
//   <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
export default function UnsavedChangesGuard({ hasUnsavedChanges }) {
  // useBlocker pauses a navigation attempt and hands us back a "blocker"
  // object we can inspect/control. We only want to pause navigations that
  // actually go somewhere else (not, say, clicking the same link twice).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname,
  );

  if (blocker.state !== 'blocked') return null;

  return (
    <ConfirmDialog
      title="Leave without saving?"
      message="You have unsaved work on this page. If you leave now, it will be lost."
      confirmLabel="Leave anyway"
      cancelLabel="Stay on this page"
      onCancel={() => blocker.reset()}
      onConfirm={() => blocker.proceed()}
    />
  );
}
