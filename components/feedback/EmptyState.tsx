import type { ReactNode } from "react";

import { Icon } from "@/components/primitives";

import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  icon: string;
  title: string;
  body: string;
  actions?: ReactNode;
  className?: string;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function EmptyState({
  icon,
  title,
  body,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <section className={joinClasses(styles.state, className)}>
      <Icon name={icon} className={styles.icon} />
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
