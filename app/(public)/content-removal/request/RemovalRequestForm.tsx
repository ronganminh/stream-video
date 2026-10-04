"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { Icon } from "@/components/primitives";

import styles from "../forms.module.css";

type Props = {
  initialVideoUrl: string;
};

type Errors = Record<string, string>;

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const reasons = [
  ["APPEAR", "I appear in this video", "Person depicted"],
  ["PRIVACY", "Private information is shown", "Privacy complaint"],
  ["NON_CONSENSUAL", "Shared without my consent", "Urgent safety report"],
  ["SAFETY", "Other safety concern", "Safety report"],
  ["OTHER", "Other", "Removal request"],
] as const;

export function RemovalRequestForm({ initialVideoUrl }: Props) {
  const [reason, setReason] = useState("");
  const [urls, setUrls] = useState(
    [initialVideoUrl].filter(Boolean).length ? [initialVideoUrl] : [""],
  );
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [networkError, setNetworkError] = useState("");
  const [reference, setReference] = useState("");

  const validate = () => {
    const next: Errors = {};
    if (!reason) next.reason = "Select a reason.";
    if (!urls.length || urls.some((url) => !url.trim() || !isHttpUrl(url.trim()))) {
      next.urls = "Enter a valid http(s) URL for each reported item.";
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Enter a valid email address.";
    }
    if (!confirmed) next.confirmed = "Confirm the request before submitting.";
    setErrors(next);
    return next;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    const next = validate();
    if (Object.keys(next).length) return;

    submittingRef.current = true;
    setSubmitting(true);
    setNetworkError("");

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          type: "REMOVAL",
          reason,
          urls: urls.map((url) => url.trim()),
          email: email.trim(),
          details: details.trim(),
          confirmed,
          website,
        }),
      });

      const payload = (await response.json()) as {
        reference?: string;
        error?: string;
      };

      if (!response.ok || !payload.reference) {
        throw new Error(payload.error || "Couldn’t submit this request.");
      }

      setReference(payload.reference);
    } catch (error) {
      setNetworkError(
        error instanceof Error ? error.message : "Couldn’t submit this request.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (reference) {
    return (
      <div className={styles.success} role="status">
        <span className={styles.successIcon} aria-hidden="true">
          <Icon name="check" />
        </span>
        <h2>Request received</h2>
        <code>Reference · {reference}</code>
        <div className={styles.placeholderBlock}>
          <Icon name="gavel" aria-hidden="true" />
          <span>LEGAL COPY — FINAL TEXT REQUIRED</span>
        </div>
        <Link className={styles.successAction} href="/">
          Back to GayVideo.fun
        </Link>
      </div>
    );
  }

  const summary = Object.values(errors);

  return (
    <form
      className={styles.form}
      method="post"
      action="/api/requests"
      onSubmit={submit}
    >
      <input type="hidden" name="type" value="REMOVAL" />

      <section id="request" className={styles.group}>
        <h2 className={styles.groupTitle}>REQUEST</h2>
        <fieldset className={styles.choiceGroup}>
          <legend>
            Reason <span className={styles.required}>*</span>
          </legend>
          <div className={styles.radios}>
            {reasons.map(([value, label, note]) => (
              <label className={styles.radio} key={value}>
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  disabled={submitting}
                  required
                />
                <span>
                  {label}
                  <small> · {note}</small>
                </span>
              </label>
            ))}
          </div>
          {errors.reason ? (
            <p className={styles.error}>
              <Icon name="error" />
              {errors.reason}
            </p>
          ) : null}
        </fieldset>

        <div className={styles.field}>
          <span>
            Video URL(s) <span className={styles.required}>*</span>
          </span>
          <div className={styles.urlList}>
            {urls.map((url, index) => (
              <div className={styles.urlRow} key={index}>
                <input
                  type="url"
                  name="urls"
                  autoComplete="off"
                  maxLength={2000}
                  required
                  value={url}
                  onChange={(event) =>
                    setUrls((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.currentTarget.value : item,
                      ),
                    )
                  }
                  onBlur={validate}
                  aria-label={`Video URL ${index + 1}`}
                  aria-invalid={Boolean(errors.urls)}
                  disabled={submitting}
                />
                {urls.length > 1 ? (
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() =>
                      setUrls((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    disabled={submitting}
                    aria-label={`Remove video URL ${index + 1}`}
                  >
                    <Icon name="close" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            className={styles.addButton}
            onClick={() => setUrls((current) => [...current, ""])}
            disabled={submitting || urls.length >= 20}
          >
            Add another URL
          </button>
          {errors.urls ? (
            <p className={styles.error}>
              <Icon name="error" />
              {errors.urls}
            </p>
          ) : null}
        </div>
      </section>

      <section id="privacy" className={styles.group}>
        <h2 className={styles.groupTitle}>PRIVACY</h2>
        <div className={styles.placeholderBlock}>
          <Icon name="gavel" aria-hidden="true" />
          <span>LEGAL COPY — FINAL TEXT REQUIRED</span>
        </div>
      </section>

      <section id="contact" className={styles.group}>
        <h2 className={styles.groupTitle}>CONTACT</h2>
        <label className={styles.field}>
          <span>
            Contact email <span className={styles.required}>*</span>
          </span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            maxLength={320}
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            onBlur={validate}
            aria-invalid={Boolean(errors.email)}
            disabled={submitting}
          />
          {errors.email ? (
            <p className={styles.error}>
              <Icon name="error" />
              {errors.email}
            </p>
          ) : null}
        </label>

        <label className={styles.field}>
          <span>
            Details <small>· optional</small>
          </span>
          <textarea
            name="details"
            value={details}
            onChange={(event) => setDetails(event.currentTarget.value)}
            placeholder="What should we know?"
            maxLength={4000}
            disabled={submitting}
          />
        </label>

        <label className={styles.check}>
          <input
            type="checkbox"
            name="confirmed"
            value="true"
            required
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
            disabled={submitting}
          />
          <span>LEGAL COPY — FINAL TEXT REQUIRED</span>
        </label>
        {errors.confirmed ? (
          <p className={styles.error}>
            <Icon name="error" />
            {errors.confirmed}
          </p>
        ) : null}
      </section>

      <label className={styles.honeypot} aria-hidden="true">
        Website
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.currentTarget.value)}
        />
      </label>

      {summary.length ? (
        <div className={styles.errorSummary} role="alert" tabIndex={-1}>
          <strong>
            {summary.length} field{summary.length === 1 ? "" : "s"} need attention
          </strong>
          <ul>
            {summary.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {networkError ? (
        <p className={styles.networkError} role="alert">
          {networkError}
        </p>
      ) : null}

      <div className={styles.submitBar}>
        <button className={styles.submitButton} type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
