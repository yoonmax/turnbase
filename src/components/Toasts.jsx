import { useApp } from '../app/store.js';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-24 sm:bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          className="glass flex items-center gap-3 h-10 pl-4 pr-2.5 rounded-full text-ink text-[0.8125rem] whitespace-nowrap"
          style={{ boxShadow: 'var(--shadow-overlay)' }}
        >
          <span className={toast.action ? '' : 'pr-1.5'}>{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              data-testid="toast-action"
              className="h-6 px-2 rounded bg-transparent border-none text-ink font-semibold underline underline-offset-2"
              onClick={() => {
                toast.action.run();
                dismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
