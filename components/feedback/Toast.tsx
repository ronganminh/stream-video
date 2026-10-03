"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/primitives";

import styles from "./Toast.module.css";

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const DEFAULT_DURATION_MS = 2200;

export type ToastTone = "default" | "success" | "error";

export type ToastProps = {
  open: boolean;
  message: string;
  onClose: () => void;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

export type ToastOptions = Omit<
  ToastProps,
  "open" | "message" | "onClose"
>;

type ToastRecord = {
  id: number;
  message: string;
  options: ToastOptions;
};

type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => void;
  dismissToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function getFocusable(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

function lockBodyScroll() {
  const body = document.body;
  const count = Number(body.dataset.gvScrollLockCount ?? "0");

  if (count === 0) {
    body.dataset.gvPreviousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
  }

  body.dataset.gvScrollLockCount = String(count + 1);

  return () => {
    const nextCount = Math.max(
      0,
      Number(body.dataset.gvScrollLockCount ?? "1") - 1,
    );

    if (nextCount === 0) {
      body.style.overflow = body.dataset.gvPreviousOverflow ?? "";
      delete body.dataset.gvPreviousOverflow;
      delete body.dataset.gvScrollLockCount;
      return;
    }

    body.dataset.gvScrollLockCount = String(nextCount);
  };
}

function toneIcon(tone: ToastTone) {
  if (tone === "success") return "check_circle";
  if (tone === "error") return "error";
  return "info";
}

export function Toast({
  open,
  message,
  onClose,
  tone = "default",
  actionLabel,
  onAction,
  durationMs = DEFAULT_DURATION_MS,
}: ToastProps) {
  const [mounted, setMounted] = useState(false);
  const toastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const toast = toastRef.current;
    if (!toast) return;

    const returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const unlockBody = lockBodyScroll();

    const timeout = window.setTimeout(onClose, durationMs);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusable(toast);

      if (focusable.length === 0) {
        event.preventDefault();
        toast.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !toast.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }

      if (active === last || !toast.contains(active)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", onKeyDown, true);
      unlockBody();

      if (returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  }, [durationMs, onClose, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className={styles.viewport} aria-live="polite">
      <div
        ref={toastRef}
        className={styles.toast}
        role="status"
        aria-atomic="true"
        tabIndex={-1}
        data-tone={tone}
        data-gv-motion="slide"
      >
        <Icon name={toneIcon(tone)} className={styles.icon} />
        <span className={styles.message}>{message}</span>

        {actionLabel ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              onAction?.();
              onClose();
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastRecord | null>(null);
  const nextId = useRef(0);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      nextId.current += 1;
      setToast({
        id: nextId.current,
        message,
        options,
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Toast
          key={toast.id}
          open
          message={toast.message}
          onClose={dismissToast}
          {...toast.options}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
