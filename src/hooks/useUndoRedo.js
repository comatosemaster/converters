import { useCallback, useState } from 'react';

// Wraps a piece of state with a simple undo/redo snapshot stack.
//
// This is deliberately NOT the same thing as a text field's native
// undo (which tracks every keystroke) — it's for discrete, deliberate
// actions, like a one-click "Sort lines" or "UPPERCASE" button, where a
// single Undo click should fully reverse that ONE action.
//
// Two setters are exposed on purpose:
//   - set(newValue)              — records history, use this from buttons
//   - setWithoutHistory(newValue) — no history, use this for raw typing
//     (a <textarea>'s own native Ctrl+Z already handles that case, and
//     recording every keystroke here would make one Undo click only
//     erase a single character instead of reversing a whole button
//     action).
export function useUndoRedo(initialValue) {
  const [value, setValue] = useState(initialValue);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const set = useCallback(
    (newValue) => {
      setUndoStack((prev) => [...prev, value]);
      setRedoStack([]); // a new change invalidates any old "future" to redo into
      setValue(newValue);
    },
    [value],
  );

  const setWithoutHistory = useCallback((newValue) => {
    setValue(newValue);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      setRedoStack((redoPrev) => [...redoPrev, value]);
      setValue(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }, [value]);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      setUndoStack((undoPrev) => [...undoPrev, value]);
      setValue(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }, [value]);

  return {
    value,
    set,
    setWithoutHistory,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
