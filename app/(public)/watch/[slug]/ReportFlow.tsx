"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Icon } from "@/components/primitives";

import styles from "./ReportFlow.module.css";

type Reason =
  | "UNDERAGE"
  | "NON_CONSENSUAL"
  | "ILLEGAL"
  | "COPYRIGHT"
  | "PRIVACY"
  | "SPAM"
  | "OTHER";

type Step = "reason" | "details" | "success";

type Props = {
  videoId: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
};

const urgentReasons = new Set<Reason>([
  "UNDERAGE",
  "NON_CONSENSUAL",
  "ILLEGAL",
]);

const reasons: Array<{
  value: Reason;
  label: string;
  urgent?: boolean;
}> = [
  { value: "UNDERAGE", label: "Underage content", urgent: true },
  { value: "NON_CONSENSUAL", label: "Non-consensual content", urgent: true },
  { value: "ILLEGAL", label: "Illegal content", urgent: true },
  { value: "COPYRIGHT", label: "Copyright infringement" },
  { value: "PRIVACY", label: "Privacy violation" },
  { value: "SPAM", label: "Spam" },
  { value: "OTHER", label: "Other" },
];

function formatTimestamp(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function routeWithVideo(path: string, pageUrl: string) {
  const query = new URLSearchParams({ video: pageUrl });
  return `${path}?${query.toString()}`;
}

export function ReportFlow({
  videoId,
  slug,
  title,
  thumbnailUrl,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [timestampSeconds, setTimestampSeconds] = useState(0);
  const [online, setOnline] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reference, setReference] = useState("");

  useEffect(() => {
    const onReport = (event: Event) => {
      const detail = (event as CustomEvent<{ videoId?: string }>).detail;
      if (detail?.videoId && detail.videoId !== videoId) return;
      setOpen(true);
      setFailed(false);
    };

    const onTime = (event: Event) => {
      const detail = (event as CustomEvent<{ seconds?: number }>).detail;
      if (typeof detail?.seconds === "number") {
        setTimestampSeconds(Math.max(0, Math.floor(detail.seconds)));
      }
    };

    const syncOnline = () => setOnline(navigator.onLine);

    window.addEventListener("gv:report", onReport);
    window.addEventListener("gv:player-time", onTime);
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    syncOnline();

    return () => {
      window.removeEventListener("gv:report", onReport);
      window.removeEventListener("gv:player-time", onTime);
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, [videoId]);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeRef.current?.focus());

    return () => {
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (submitting) {
          event.preventDefault();
          return;
        }
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled])',
        ),
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, submitting]);

  const pageUrl =
    typeof window === "undefined"
      ? `/watch/${slug}`
      : `${window.location.origin}/watch/${slug}`;

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const reset = () => {
    setStep("reason");
    setReason(null);
    setDetails("");
    setEmail("");
    setWebsite("");
    setFailed(false);
    setReference("");
  };

  const continueFromReason = () => {
    if (!reason) return;

    if (reason === "COPYRIGHT") {
      window.location.assign(routeWithVideo("/content-removal/dmca", pageUrl));
      return;
    }

    if (reason === "PRIVACY") {
      window.location.assign(routeWithVideo("/content-removal/request", pageUrl));
      return;
    }

    setStep("details");
    setFailed(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason || !online || submitting) return;

    setSubmitting(true);
    setFailed(false);

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          videoId,
          reason,
          details,
          contactEmail: email,
          pageUrl,
          timestampSeconds,
          website,
        }),
      });

      if (!response.ok) throw new Error("Submit failed");

      const payload = (await response.json()) as { reference?: string };
      setReference(payload.reference ?? "");
      setStep("success");
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && submitting) event.preventDefault();
  };

  if (!open) return null;

  const selected = reasons.find((item) => item.value === reason);
  const urgent = Boolean(reason && urgentReasons.has(reason));
  const posterStyle = thumbnailUrl
    ? {
        backgroundImage: `url("${thumbnailUrl.replaceAll('"', "%22")}")`,
      }
    : undefined;

  return (
    <div className={styles.backdrop} onMouseDown={close}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <span className={styles.handle} aria-hidden="true" />

        {step === "success" ? (
          <div className={styles.success}>
            <span className={styles.successIcon} aria-hidden="true">
              <Icon name="check" />
            </span>
            <h2 id={titleId}>Report received</h2>
            <p>LEGAL COPY — FINAL TEXT REQUIRED</p>
            {reference ? <code>Reference · {reference}</code> : null}
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Done
            </button>
            <button type="button" className={styles.secondaryButton} onClick={close}>
              Return to video
            </button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              {step === "details" ? (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setStep("reason")}
                  disabled={submitting}
                  aria-label="Back to report reasons"
                >
                  <Icon name="arrow_back" />
                </button>
              ) : null}
              <h2 id={titleId}>
                {step === "reason" ? "Report this video" : selected?.label}
              </h2>
              <button
                ref={closeRef}
                type="button"
                className={styles.iconButton}
                onClick={close}
                disabled={submitting}
                aria-label="Close report dialog"
              >
                <Icon name="close" />
              </button>
            </div>

            <div className={styles.progress} aria-hidden="true">
              <span className={styles.progressActive} />
              <span className={step === "details" ? styles.progressActive : ""} />
            </div>

            {step === "reason" ? (
              <>
                <div className={styles.reasonSection}>
                  <span className={styles.urgentLabel}>URGENT SAFETY REPORT</span>
                  {reasons.slice(0, 3).map((item) => (
                    <label
                      key={item.value}
                      className={reason === item.value ? styles.reasonSelectedDanger : styles.reason}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={item.value}
                        checked={reason === item.value}
                        onChange={() => setReason(item.value)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}

                  <span className={styles.otherLabel}>OTHER</span>
                  <div className={styles.otherGrid}>
                    {reasons.slice(3).map((item) => (
                      <label
                        key={item.value}
                        className={reason === item.value ? styles.reasonSelected : styles.reason}
                      >
                        <input
                          type="radio"
                          name="report-reason"
                          value={item.value}
                          checked={reason === item.value}
                          onChange={() => setReason(item.value)}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.footer}>
                  <button type="button" className={styles.cancelButton} onClick={close}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={continueFromReason}
                    disabled={!reason}
                    aria-disabled={!reason}
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={submit}>
                {urgent ? (
                  <p className={styles.urgentCopy}>
                    Urgent safety report. No account needed.
                  </p>
                ) : null}

                <div className={styles.attachment}>
                  <span className={styles.thumb} style={posterStyle} />
                  <span className={styles.attachmentText}>
                    <strong>{title}</strong>
                    <code>
                      /watch/{slug} · {formatTimestamp(timestampSeconds)}
                    </code>
                  </span>
                  <Icon name="attach_file" />
                </div>

                <label className={styles.field}>
                  <span>
                    Details <small>· optional</small>
                  </span>
                  <textarea
                    value={details}
                    onChange={(event) => setDetails(event.currentTarget.value)}
                    placeholder="Anything that helps the review"
                    maxLength={4000}
                    disabled={submitting}
                  />
                </label>

                <label className={styles.field}>
                  <span>
                    Contact email <small>· optional</small>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    placeholder="For follow-up questions only"
                    maxLength={320}
                    disabled={submitting}
                  />
                </label>

                <label className={styles.honeypot} aria-hidden="true">
                  Website
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(event) => setWebsite(event.currentTarget.value)}
                  />
                </label>

                {!online ? (
                  <p className={styles.offline} role="status">
                    You’re offline. Your report will be ready to send when you reconnect.
                  </p>
                ) : null}

                {failed ? (
                  <p className={styles.failure} role="alert">
                    Couldn’t send your report. Try again.
                  </p>
                ) : null}

                <div className={styles.footer}>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={() => setStep("reason")}
                    disabled={submitting}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className={urgent ? styles.dangerButton : styles.primaryButton}
                    disabled={submitting || !online}
                  >
                    {submitting ? "Submitting…" : "Submit report"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {step === "details" && reason === "PRIVACY" ? (
          <Link href={routeWithVideo("/content-removal/request", pageUrl)}>
            Request removal
          </Link>
        ) : null}
      </div>
    </div>
  );
}
