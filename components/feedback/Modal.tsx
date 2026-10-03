"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { Icon, IconButton } from "@/components/primitives";

import styles from "./Modal.module.css";

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  className?: string;
};

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  initialFocusRef,
  closeOnBackdrop = true,
  className,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;

    const returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const unlockBody = lockBodyScroll();

    const focusFrame = window.requestAnimationFrame(() => {
      const preferred = initialFocusRef?.current;
      const focusable = getFocusable(panel);
      const target =
        preferred && panel.contains(preferred)
          ? preferred
          : focusable[0] ?? panel;

      target.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusable(panel);

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }

      if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      unlockBody();

      if (returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  }, [initialFocusRef, onClose, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (
          closeOnBackdrop &&
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
      data-gv-motion="modal"
    >
      <div
        ref={panelRef}
        className={joinClasses(styles.panel, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-gv-motion="modal"
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <IconButton
            aria-label="Close dialog"
            variant="surface"
            className={styles.close}
            onClick={onClose}
          >
            <Icon name="close" className={styles.closeIcon} />
          </IconButton>
        </div>

        <div className={styles.body}>{children}</div>

        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
