import { createElement, lazy } from 'react';

// React.lazy(), plus a way to load the component BEFORE React asks for it.
//
// Why plain lazy() isn't enough: every page is prerendered to static HTML
// at build time, and the browser then "hydrates" that HTML - React walks
// the existing markup instead of rebuilding it. A plain lazy() component
// always suspends on its first render, even when its chunk has already
// downloaded, so:
//   - at build time the tool's UI would be written out as a loading
//     placeholder followed by a hidden copy of the real UI, which crawlers
//     that don't run JavaScript would never see in place;
//   - in the browser, hydration would have to wait on it.
//
// With preload(), the build script and main.jsx can load the current
// page's tool first. Once loaded, the component renders synchronously -
// exactly like a normal import - so the markup is identical on both sides.
// Tools that haven't been preloaded (clicking to another tool later) still
// go through lazy() and the Suspense fallback, as before.
export function lazyWithPreload(load) {
  let Loaded = null;

  function loadAndRemember() {
    return load().then((module) => {
      Loaded = module.default;
      return module;
    });
  }

  const LazyComponent = lazy(loadAndRemember);

  function PreloadableComponent(props) {
    return createElement(Loaded ?? LazyComponent, props);
  }

  PreloadableComponent.preload = loadAndRemember;
  return PreloadableComponent;
}
