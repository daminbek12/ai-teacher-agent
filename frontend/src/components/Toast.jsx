import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext(null);

let toastId = 0;

const toastConfig = {
  success: { icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0", bar: "bg-success-600", iconColor: "text-success-600" },
  error: { icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0", bar: "bg-danger-600", iconColor: "text-danger-600" },
  warning: { icon: "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z", bar: "bg-warning-600", iconColor: "text-warning-600" },
  info: { icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z", bar: "bg-primary-600", iconColor: "text-primary-600" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolve = useRef(null);

  const dismiss = useCallback((id) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((type, message, { duration = 4200 } = {}) => {
    const id = ++toastId;
    setToasts((p) => [...p.slice(-3), { id, type, message }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const api = {
    success: useCallback((m, o) => toast("success", m, o), [toast]),
    error: useCallback((m, o) => toast("error", m, o), [toast]),
    warning: useCallback((m, o) => toast("warning", m, o), [toast]),
    info: useCallback((m, o) => toast("info", m, o), [toast]),
    confirm: useCallback(
      (message, { title = "Tasdiqlash", confirmText = "Ha, davom etish", cancelText = "Bekor qilish", danger = false } = {}) =>
        new Promise((resolve) => {
          confirmResolve.current = resolve;
          setConfirmState({ message, title, confirmText, cancelText, danger });
        }),
      []
    ),
  };

  const closeConfirm = (result) => {
    setConfirmState(null);
    confirmResolve.current?.(result);
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" role="region" aria-label="Bildirishnomalar">
        {toasts.map((t) => {
          const cfg = toastConfig[t.type] || toastConfig.info;
          return (
            <div
              key={t.id}
              role="status"
              aria-live="polite"
              className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-stone-200 bg-white p-4 pr-10 shadow-overlay animate-toast-in"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${cfg.bar}`} aria-hidden="true" />
              <svg className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.iconColor}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
              </svg>
              <div className="text-sm text-slate-700">{t.message}</div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Bildirishnomani yopish"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-stone-100 hover:text-slate-600"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {confirmState && (
        <ConfirmDialog state={confirmState} onClose={closeConfirm} />
      )}
    </ToastContext.Provider>
  );
}

function ConfirmDialog({ state, onClose }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose(false);
    };
    document.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-fade-in" onClick={() => onClose(false)} role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-overlay animate-scale-in"
      >
        <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-full ${state.danger ? "bg-danger-50 text-danger-600" : "bg-primary-50 text-primary-700"}`} aria-hidden="true">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={state.danger ? "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" : "M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"} />
          </svg>
        </div>
        <h3 id="confirm-title" className="text-h3 mb-2">{state.title}</h3>
        <p className="text-body-sm mb-6">{state.message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={() => onClose(false)}
            className="min-h-[40px] rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-stone-50 active:bg-stone-100"
          >
            {state.cancelText}
          </button>
          <button
            onClick={() => onClose(true)}
            className={`min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors ${state.danger ? "bg-danger-600 hover:bg-danger-700" : "bg-primary-700 hover:bg-primary-800"}`}
          >
            {state.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast ToastProvider ichida ishlatilishi kerak");
  return ctx;
}
