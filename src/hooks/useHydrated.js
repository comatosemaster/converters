import { useSyncExternalStore } from 'react';

// false while a page is being prerendered at build time AND during the
// browser's first (hydrating) render of that HTML; true from then on - and
// straight away when a page is reached by in-app navigation, since nothing
// is being hydrated then.
//
// For the rare piece of UI whose content depends on the visitor's own
// machine - the current time, their time zone - and so can't match HTML
// generated at build time. Render a stable placeholder while this is
// false, and the real thing once it's true. React switches over right
// after hydrating, without a hydration mismatch.
const subscribe = () => () => {};

export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
