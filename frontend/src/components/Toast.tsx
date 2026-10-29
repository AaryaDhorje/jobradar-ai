import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { kind?: ToastKind; action?: ToastItem["action"]; durationMs?: number }) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (message, opts = {}) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-3), { id, kind: opts.kind ?? "info", message, action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.durationMs ?? (opts.action ? 6000 : 4000));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, { kind: "success" }),
      error: (m) => show(m, { kind: "error", durationMs: 6000 }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800"
          >
            {t.kind === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />}
            {t.kind === "error" && <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />}
            {t.kind === "info" && <Info className="mt-0.5 size-4 shrink-0 text-brand-500" />}
            <p className="flex-1 text-slate-700 dark:text-slate-200">{t.message}</p>
            {t.action && (
              <button
                className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              aria-label="Dismiss"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              onClick={() => dismiss(t.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
