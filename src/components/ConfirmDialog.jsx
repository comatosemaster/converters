import { useEffect } from 'react';

// A generic "are you sure?" modal - the same stylish dialog used for the
// in-app navigation warning (see UnsavedChangesGuard.jsx) is reused here
// for any other destructive action a tool wants to confirm first, like a
// "choose a different image" button that would throw away unsaved work.
//
// Usage:
//   {showConfirm && (
//     <ConfirmDialog
//       title="Discard this image?"
//       message="You have unsaved work. Choosing a different image will discard it."
//       confirmLabel="Discard and choose another"
//       onCancel={() => setShowConfirm(false)}
//       onConfirm={() => { setShowConfirm(false); actuallyDoTheReset(); }}
//     />
//   )}
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
}) {
  // Let Escape do the safe thing (cancel), same as clicking outside the box.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        // Stop clicks inside the dialog from bubbling up and closing it
        // via the overlay's onClick above.
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="modal-button" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button type="button" className="modal-button modal-button-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
