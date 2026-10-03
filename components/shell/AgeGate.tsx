"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import styles from "./AgeGate.module.css";

const AGE_GATE_ACTION_FIELD = "_gv_age_gate";
const AGE_GATE_ACTION_VALUE = "acknowledge";
const LEAVE_URL =
  process.env.NEXT_PUBLIC_AGE_GATE_LEAVE_URL?.trim() || "about:blank";

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])';

export type AgeGateProps = {
  cookieName: string;
  cookieLifetimeDays: number | null;
};

function getFocusable(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

function buildAcknowledgementCookie(
  cookieName: string,
  cookieLifetimeDays: number | null,
) {
  const attributes = [
    `${encodeURIComponent(cookieName)}=1`,
    "Path=/",
    "SameSite=Lax",
  ];

  if (cookieLifetimeDays !== null) {
    attributes.push(
      `Max-Age=${Math.trunc(cookieLifetimeDays * 24 * 60 * 60)}`,
    );
  }

  if (window.location.protocol === "https:") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function AgeGate({
  cookieName,
  cookieLifetimeDays,
}: AgeGateProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const dialogRef = useRef<HTMLElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      primaryActionRef.current?.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        window.location.assign(LEAVE_URL);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusable(dialog);

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }

      if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;

      const previous = returnFocusRef.current;

      if (previous && previous !== document.body && previous.isConnected) {
        previous.focus({ preventScroll: true });
        return;
      }

      document
        .querySelector<HTMLElement>(
          'main a[href], main button:not(:disabled), main [tabindex]:not([tabindex="-1"])',
        )
        ?.focus({ preventScroll: true });
    };
  }, [open]);

  const acknowledge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    document.cookie = buildAcknowledgementCookie(
      cookieName,
      cookieLifetimeDays,
    );
    setOpen(false);
    router.refresh();
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} data-gv-motion="modal">
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-gv-motion="modal"
      >
        <div className={styles.brand} aria-label="GayVideo.fun">
          <svg
            className={styles.mark}
            width="34"
            height="34"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="gv-age-gate-logo"
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <stop offset="0" stopColor="var(--gv-violet)" />
                <stop offset="1" stopColor="var(--gv-magenta)" />
              </linearGradient>
            </defs>
            <rect
              width="32"
              height="32"
              rx="9"
              fill="url(#gv-age-gate-logo)"
            />
            <path
              d="M22.6 10.2A8.6 8.6 0 1 0 24.6 16.5H20"
              fill="none"
              stroke="var(--gv-text)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M13.2 12.6v7.2l5.6-3.6z"
              fill="var(--gv-text)"
            />
          </svg>
          <span className={styles.wordmark}>
            GayVideo<span>.fun</span>
          </span>
        </div>

        <div className={styles.ageMark} aria-hidden="true">
          18+
        </div>

        <h2 id={titleId} className={styles.title}>
          Adults Only
        </h2>

        <p id={descriptionId} className={styles.description}>
          LEGAL COPY — FINAL TEXT REQUIRED
        </p>

        <form
          method="post"
          className={styles.actions}
          onSubmit={acknowledge}
        >
          <input
            type="hidden"
            name={AGE_GATE_ACTION_FIELD}
            value={AGE_GATE_ACTION_VALUE}
          />
          <button
            ref={primaryActionRef}
            type="submit"
            className={styles.enter}
          >
            I&apos;m 18 or older
          </button>
          <a className={styles.leave} href={LEAVE_URL}>
            Leave
          </a>
        </form>

        <div className={styles.legal}>
          <span>Terms</span>
          <span>Privacy</span>
          <span>Content Policy</span>
        </div>
      </section>
    </div>
  );
}
