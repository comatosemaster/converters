import { useEffect } from 'react';

// Warns the user with the browser's own "Leave site?" dialog if they try to
// close the tab, refresh, or navigate away while they have unsaved work.
//
// Usage: call this once near the top of a tool component, passing a single
// boolean for whether there's currently something worth protecting:
//
//   useUnsavedChangesWarning(someInput.length > 0);
//
// Pass `true` once the user has done something worth not losing (typed
// text, picked a file, changed a setting away from its default...), and
// back to `false` once that's saved (e.g. they've downloaded the result)
// or cleared (e.g. the input is empty again).
//
// Note: modern browsers do NOT show whatever text you put in the dialog —
// this is intentional on their part, so a malicious site can't trick
// people with a fake custom message. Every browser shows its own generic
// wording ("Leave site? Changes you made may not be saved.") no matter
// what we do here. Setting event.returnValue is just the old-fashioned
// signal that means "yes, please show that dialog" — most browsers still
// require it even though they ignore its actual value.
export function useUnsavedChangesWarning(hasUnsavedChanges) {
  useEffect(() => {
    // Nothing worth protecting — don't attach anything at all, so a
    // pristine, untouched tool never shows this warning.
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Runs when hasUnsavedChanges flips back to false, or when the
    // component unmounts (e.g. the user navigates to a different tool).
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);
}
