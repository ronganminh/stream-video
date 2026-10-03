import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  ReactNode,
} from "react";

import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonBaseProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
};

type LinkProps = ComponentPropsWithoutRef<typeof Link>;

type ButtonLinkProps = ButtonBaseProps &
  Omit<LinkProps, "children" | "className" | "href"> & {
    href: LinkProps["href"];
  };

type NativeButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "disabled"> & {
    href?: undefined;
  };

export type ButtonProps = ButtonLinkProps | NativeButtonProps;

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export function Button(props: ButtonProps) {
  const {
    children,
    className,
    variant = "primary",
    size = "md",
    loading = false,
    disabled = false,
    ...rest
  } = props;

  const classes = joinClasses(
    styles.button,
    styles[variant],
    styles[size],
    loading && styles.loading,
    className,
  );

  const content = (
    <>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <span className={styles.label}>{children}</span>
    </>
  );

  if ("href" in rest && rest.href !== undefined) {
    const { href, tabIndex, ...linkProps } = rest;

    return (
      <Link
        {...linkProps}
        href={href}
        className={classes}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        tabIndex={disabled || loading ? -1 : tabIndex}
        data-gv-motion="lift"
      >
        {content}
      </Link>
    );
  }

  const buttonProps = rest as Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "disabled"
  >;

  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-gv-motion="lift"
    >
      {content}
    </button>
  );
}
