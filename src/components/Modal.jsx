import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

let openCount = 0;

/**
 * A native <dialog>, which brings focus trapping, Escape and top-layer stacking.
 * While any modal is open the timer ignores its trigger key.
 */
export function Modal({ open, onClose, title, width = '34rem', children, flush = false, testId }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) {
      dialog.showModal();
      openCount += 1;
      document.body.dataset.modalOpen = 'true';
      return () => {
        dialog.close();
        openCount -= 1;
        if (openCount <= 0) {
          openCount = 0;
          delete document.body.dataset.modalOpen;
        }
      };
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="modal scrollbar-quiet"
      style={{ '--modal-width': width }}
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {title ? (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="text-base font-medium m-0">{title}</h2>
          <button type="button" className="icon-btn -mr-1.5" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.6} />
          </button>
        </header>
      ) : null}
      <div className={flush ? '' : 'px-5 pb-5'}>{children}</div>
    </dialog>
  );
}

/** Asks before something that cannot be undone. */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width="26rem" testId="confirm-dialog">
      <p className="m-0 text-graphite">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" data-testid="confirm-action" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
