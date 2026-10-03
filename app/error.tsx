"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, Icon } from "@/components/primitives";

import styles from "./error.module.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.page}>
      <section className={styles.panel} role="alert">
        <span className={styles.icon} aria-hidden="true">
          <Icon name="cloud_off" />
        </span>
        <span className={styles.code}>SOMETHING WENT WRONG</span>
        <h1>Couldn&apos;t load this page</h1>
        <p>Try again, or return home and continue browsing.</p>

        <div className={styles.actions}>
          <Button onClick={reset}>Try again</Button>
          <Link className={styles.home} href="/">
            Go Home
          </Link>
        </div>
      </section>
    </main>
  );
}
