import Link from "next/link";
import type {
  CSSProperties,
  MouseEventHandler,
  ReactNode,
} from "react";

import { Icon } from "./Icon";
import styles from "./TagChip.module.css";

type TagChipBaseProps = {
  children: ReactNode;
  className?: string;
  selected?: boolean;
  style?: CSSProperties;
  title?: string;
  id?: string;
  "aria-label"?: string;
};

type TagChipLinkProps = TagChipBaseProps & {
  href: string;
  filter?: false;
};

type TagChipFilterProps = TagChipBaseProps & {
  filter: true;
  href?: never;
  disabled?: boolean;
  name?: string;
  value?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export type TagChipProps = TagChipLinkProps | TagChipFilterProps;

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function ChipContent({
  children,
  selected,
}: Pick<TagChipBaseProps, "children" | "selected">) {
  return (
    <>
      {selected ? <Icon name="check" className={styles.check} /> : null}
      <span>{children}</span>
    </>
  );
}

export function TagChip(props: TagChipProps) {
  const {
    children,
    className,
    selected = false,
    style,
    title,
    id,
    "aria-label": ariaLabel,
  } = props;
  const classes = joinClasses(styles.chip, selected && styles.selected, className);

  if (props.filter) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        title={title}
        id={id}
        aria-label={ariaLabel}
        aria-pressed={selected}
        disabled={props.disabled}
        name={props.name}
        value={props.value}
        onClick={props.onClick}
      >
        <ChipContent selected={selected}>{children}</ChipContent>
      </button>
    );
  }

  return (
    <Link
      href={props.href}
      className={classes}
      style={style}
      title={title}
      id={id}
      aria-label={ariaLabel}
      aria-current={selected ? "page" : undefined}
    >
      <ChipContent selected={selected}>{children}</ChipContent>
    </Link>
  );
}
