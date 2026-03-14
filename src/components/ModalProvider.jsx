import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [stack, setStack] = useState([]); 
  // כל מודאל: { id, node, onClose, closeOnBackdrop, closeOnEsc }

  const closeTop = useCallback(() => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      const top = prev[prev.length - 1];
      try { top?.onClose?.(); } catch {}
      return prev.slice(0, -1);
    });
  }, []);

  const closeAll = useCallback(() => {
    setStack((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        try { prev[i]?.onClose?.(); } catch {}
      }
      return [];
    });
  }, []);

  const openModal = useCallback((node, opts = {}) => {
    const id = crypto?.randomUUID?.() ?? String(Date.now() + Math.random());

    const modal = {
      id,
      node,
      onClose: opts.onClose,
      closeOnBackdrop: opts.closeOnBackdrop ?? true,
      closeOnEsc: opts.closeOnEsc ?? true,
    };

    setStack((prev) => [...prev, modal]);

    return id;
  }, []);

  const closeModal = useCallback((id) => {
    setStack((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx === -1) return prev;
      try { prev[idx]?.onClose?.(); } catch {}
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  // ESC: סוגר רק את העליון
  useEffect(() => {
    if (stack.length === 0) return;

    const top = stack[stack.length - 1];
    if (!top.closeOnEsc) return;

    const onKey = (e) => {
      if (e.key === "Escape") closeTop();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack, closeTop]);

  // Scroll lock כשיש מודאלים
  useEffect(() => {
    if (stack.length === 0) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stack.length]);

  const value = useMemo(
    () => ({ openModal, closeModal, closeTop, closeAll, hasModal: stack.length > 0 }),
    [openModal, closeModal, closeTop, closeAll, stack.length]
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      <ModalRoot stack={stack} onBackdropClose={closeTop} />
    </ModalContext.Provider>
  );
}

function ModalRoot({ stack, onBackdropClose }) {
  if (typeof document === "undefined") return null;
  if (!stack.length) return null;

  // מציירים את כולם, העליון אחרון
  const root = (
    <div className="app-modal-root" aria-live="polite">
      {stack.map((m, idx) => {
        const isTop = idx === stack.length - 1;
        return (
          <div
            key={m.id}
            className={`app-modal-overlay ${isTop ? "is-top" : ""}`}
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              // סגירה בלחיצה על backdrop רק אם זה העליון
              if (!isTop) return;
              if (!m.closeOnBackdrop) return;

              // רק אם לחצת על הרקע ולא על התוכן
              if (e.target === e.currentTarget) onBackdropClose();
            }}
          >
            {m.node}
          </div>
        );
      })}
    </div>
  );

  return createPortal(root, document.body);
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}