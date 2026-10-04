"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";

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

export function DMCAForm({ initialVideoUrl }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [work, setWork] = useState("");
  const [urls, setUrls] = useState(
    [initialVideoUrl].filter(Boolean).length ? [initialVideoUrl] : [""],
  );
  const [goodFaith, setGoodFaith] = useState(false);
  const [authority, setAuthority] = useState(false);
  const [signature, setSignature] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [networkError, setNetworkError] = useState("");
  const [reference, setReference] = useState("");

  const date = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date()),
    [],
  );

  const validate = () => {
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter your full legal name.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Enter a valid email address.";
    }
    if (!role) next.role = "Select your role.";
    if (!work.trim()) next.work = "Describe the original work.";
    if (!urls.length || urls.some((url) => !url.trim() || !isHttpUrl(url.trim()))) {
      next.urls = "Enter a valid http(s) URL for each reported item.";
    }
    if (!goodFaith) next.goodFaith = "Confirm the first declaration.";
    if (!authority) next.authority = "Confirm the second declaration.";
    if (!signature.trim()) next.signature = "Enter your electronic signature.";
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
          type: "DMCA",
          fullName: name.trim(),
          email: email.trim(),
          role,
          work: work.trim(),
          urls: urls.map((url) => url.trim()),
          declarations: {
            goodFaith,
            authority,
          },
          signature: signature.trim(),
          date,
          website,
        }),
      });

      const payload = (await response.json()) as {
        reference?: string;
        error?: string;
      };

      if (!response.ok || !payload.reference) {
        throw new Error(payload.error || "Couldn’t submit this notice.");
      }

      setReference(payload.reference);
    } catch (error) {
      setNetworkError(
        error instanceof Error ? error.message : "Couldn’t submit this notice.",
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
        <h2>Notice received</h2>
        <div className={styles.placeholderBlock}>
          <Icon name="gavel" aria-hidden="true" />
          <span>LEGAL COPY — FINAL TEXT REQUIRED</span>
        </div>
        <code>Reference · {reference}</code>
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
      <input type="hidden" name="type" value="DMCA" />

      <section id="details" className={styles.group}>
        <h2 className={styles.groupTitle}>1 · YOUR DETAILS</h2>
        <label className={styles.field}>
          <span>
            Full legal name <span className={styles.required}>*</span>
          </span>
          <input
            name="fullName"
            autoComplete="name"
            maxLength={200}
            required
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            onBlur={validate}
            aria-invalid={Boolean(errors.name)}
            disabled={submitting}
          />
          {errors.name ? (
            <p className={styles.error}>
              <Icon name="error" />
              {errors.name}
            </p>
          ) : null}
        </label>

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

        <fieldset className={styles.choiceGroup}>
          <legend>
            You are the <span className={styles.required}>*</span>
          </legend>
          <div className={styles.radios}>
            {[
              ["OWNER", "Copyright owner"],
              ["REPRESENTATIVE", "Authorized representative"],
            ].map(([value, label]) => (
              <label className={styles.radio} key={value}>
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                  disabled={submitting}
                  required
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {errors.role ? (
            <p className={styles.error}>
              <Icon name="error" />
              {errors.role}
            </p>
          ) : null}
        </fieldset>
      </section>

      <section id="work" className={styles.group}>
        <h2 className={styles.groupTitle}>2 · THE WORK</h2>
        <label className={styles.field}>
          <span>
            Description of the original work <span className={styles.required}>*</span>
          </span>
          <textarea
            name="work"
            value={work}
            onChange={(event) => setWork(event.currentTarget.value)}
            onBlur={validate}
            placeholder="Describe the work and where the original can be found"
            maxLength={4000}
            required
            aria-invalid={Boolean(errors.work)}
            disabled={submitting}
          />
          {errors.work ? (
            <p className={styles.error}>
              <Icon name="error" />
              {errors.work}
            </p>
          ) : null}
        </label>

        <div className={styles.field}>
          <span>
            URLs of the reported content <span className={styles.required}>*</span>
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
                  aria-label={`Reported content URL ${index + 1}`}
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
                    aria-label={`Remove reported content URL ${index + 1}`}
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

      <section id="declarations" className={styles.group}>
        <h2 className={styles.groupTitle}>3 · DECLARATIONS</h2>
        <div className={styles.checks}>
          <label className={styles.check}>
            <input
              type="checkbox"
              name="goodFaith"
              value="true"
              required
              checked={goodFaith}
              onChange={(event) => setGoodFaith(event.currentTarget.checked)}
              disabled={submitting}
            />
            <span>LEGAL COPY — FINAL TEXT REQUIRED</span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              name="authority"
              value="true"
              required
              checked={authority}
              onChange={(event) => setAuthority(event.currentTarget.checked)}
              disabled={submitting}
            />
            <span>LEGAL COPY — FINAL TEXT REQUIRED</span>
          </label>
        </div>
        {errors.goodFaith || errors.authority ? (
          <p className={styles.error}>
            <Icon name="error" />
            {errors.goodFaith || errors.authority}
          </p>
        ) : null}

        <label className={styles.field}>
          <span>
            Electronic signature <span className={styles.required}>*</span>
          </span>
          <input
            name="signature"
            autoComplete="name"
            maxLength={200}
            required
            value={signature}
            onChange={(event) => setSignature(event.currentTarget.value)}
            onBlur={validate}
            aria-invalid={Boolean(errors.signature)}
            disabled={submitting}
          />
          {errors.signature ? (
            <p className={styles.error}>
              <Icon name="error" />
              {errors.signature}
            </p>
          ) : null}
        </label>

        <label className={styles.field}>
          <span>Date</span>
          <input name="date" value={date} readOnly />
        </label>
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
          {submitting ? "Submitting…" : "Submit notice"}
        </button>
      </div>
    </form>
  );
}
