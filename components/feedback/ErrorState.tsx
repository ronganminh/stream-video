import type { ReactNode } from "react";

import { Icon } from "@/components/primitives";

import styles from "./ErrorState.module.css";

export type ErrorStateProps = {
  icon?: string;
  title: string;
  body: string;
  actions?: ReactNode;
  className?: string;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ErrorState({
  icon = "cloud_off",
  title,
  body,
  actions,
  className,
}: ErrorStateProps) {
  return (
    <section
      className={joinClasses(styles.state, className)}
      role="alert"
      aria-labelledby={`error-${icon}-title`}
    >
      <Icon name={icon} className={styles.icon} />
      <h2 id={`error-${icon}-title`} className={styles.title}>
        {title}
      </h2>
      <p className={styles.body}>{body}</p>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
