import styles from "./AdSlot.module.css";

export type AdSlotVariant =
  | "leaderboard"
  | "rectangle"
  | "in-feed"
  | "mobile";

export type AdSlotProps = {
  variant: AdSlotVariant;
  html?: string | null;
  loading?: boolean;
  className?: string;
};

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AdSlot({
  variant,
  html,
  loading = false,
  className,
}: AdSlotProps) {
  const hasFill = Boolean(html?.trim());

  if (!loading && !hasFill) {
    return null;
  }

  return (
    <aside
      className={joinClasses(styles.root, className)}
      aria-label="Advertisement"
      data-variant={variant}
    >
      <span className={styles.label}>ADVERTISEMENT</span>
      <div
        className={joinClasses(
          styles.slot,
          styles[variant],
          loading && styles.loading,
        )}
      >
        {hasFill ? (
          <div
            className={styles.content}
            dangerouslySetInnerHTML={{ __html: html ?? "" }}
          />
        ) : (
          <span className={styles.placeholder} aria-hidden="true" />
        )}
      </div>
    </aside>
  );
}
