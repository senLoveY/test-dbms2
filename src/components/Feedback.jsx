import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Button from "./Button.jsx";

const FeedbackContext = createContext(null);

let toastId = 0;

function ConfirmDialog({ request, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (request && dialog && !dialog.open) dialog.showModal();
  }, [request]);

  if (!request) return null;

  return (
    <dialog
      ref={ref}
      className="dialog dialog-confirm"
      onCancel={(event) => {
        event.preventDefault();
        onClose(false);
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose(false);
      }}
    >
      <div className="dialog-body">
        <h2 className="dialog-title">{request.title}</h2>
        {request.body && <p className="dialog-text">{request.body}</p>}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => onClose(false)}>
            {request.cancelText || "Отмена"}
          </Button>
          <Button
            variant={request.tone === "danger" ? "danger-solid" : "primary"}
            onClick={() => onClose(true)}
            autoFocus
          >
            {request.confirmText || "Подтвердить"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const resolverRef = useRef(null);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 200);
  }, []);

  const toast = useCallback(
    (message, { tone = "default", action, duration = 3200 } = {}) => {
      const id = ++toastId;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone, action }]);
      setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const confirm = useCallback((request) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfirmRequest(request);
    });
  }, []);

  function closeConfirm(result) {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setConfirmRequest(null);
  }

  const valueRef = useRef({ toast, confirm });
  valueRef.current.toast = toast;
  valueRef.current.confirm = confirm;

  return (
    <FeedbackContext.Provider value={valueRef.current}>
      {children}
      <ConfirmDialog request={confirmRequest} onClose={closeConfirm} />
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone} ${t.leaving ? "toast-leaving" : ""}`}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useFeedback must be used within FeedbackProvider");
  return context;
}
