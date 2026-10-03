"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { Icon, IconButton } from "@/components/primitives";

import styles from "./BottomSheet.module.css";

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const CLOSE_DRAG_THRESHOLD = 80;

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
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

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  actions,
  initialFocusRef,
  closeOnBackdrop = true,
  className,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      return;
    }

    const sheet = sheetRef.current;
    if (!sheet) return;

    const returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const unlockBody = lockBodyScroll();

    const focusFrame = window.requestAnimationFrame(() => {
      const preferred = initialFocusRef?.current;
      const focusable = getFocusable(sheet);
      const target =
        preferred && sheet.contains(preferred)
          ? preferred
          : focusable[0] ?? sheet;

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

      const focusable = getFocusable(sheet);

      if (focusable.length === 0) {
        event.preventDefault();
        sheet.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !sheet.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }

      if (active === last || !sheet.contains(active)) {
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

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStartRef.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current === null) return;
    setDragY(Math.max(0, event.clientY - dragStartRef.current));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (dragStart === null) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const dragDistance = Math.max(0, event.clientY - dragStart);
    dragStartRef.current = null;

    if (dragDistance >= CLOSE_DRAG_THRESHOLD) {
      onClose();
      return;
    }

    setDragY(0);
  };

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
      data-gv-motion="sheet"
    >
      <div
        ref={sheetRef}
        className={joinClasses(styles.sheet, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Bottom sheet"}
        tabIndex={-1}
        style={{ transform: `translateY(${dragY}px)` }}
        data-gv-motion="sheet"
      >
        <div
          className={styles.dragArea}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={() => {
            dragStartRef.current = null;
            setDragY(0);
          }}
          aria-hidden="true"
        >
          <span className={styles.handle} />
        </div>

        <div className={styles.header}>
          {title ? (
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          ) : (
            <span className={styles.titleSpacer} aria-hidden="true" />
          )}

          <IconButton
            aria-label="Close sheet"
            variant="ghost"
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
