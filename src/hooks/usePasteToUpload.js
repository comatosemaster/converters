import { useEffect } from 'react';

// Lets a tool's drop zone also accept a pasted image (Ctrl+V / Cmd+V) —
// handy for screenshots, since there's often no actual file on disk to
// drag in.
//
// Usage: pass `enabled` (usually "no file has been chosen yet", so pasting
// can't silently clobber existing work) and the same function the tool
// already uses to handle a picked/dropped file:
//
//   usePasteToUpload(!file, handleFile);
export function usePasteToUpload(enabled, onFile) {
  useEffect(() => {
    if (!enabled) return;

    function handlePaste(event) {
      const items = event.clipboardData?.items;
      if (!items) return;

      // Clipboard paste can contain several "items" (e.g. an image AND a
      // filename as plain text) — we only care about the first image one.
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            onFile(file);
          }
          break;
        }
      }
    }

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [enabled, onFile]);
}
