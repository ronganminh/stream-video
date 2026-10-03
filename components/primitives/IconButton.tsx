import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./IconButton.module.css";

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className"
> & {
  "aria-label": string;
  children: ReactNode;
  className?: string;
  variant?: "surface" | "ghost" | "overlay";
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function IconButton({
  children,
  className,
  variant = "surface",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={joinClasses(styles.button, styles[variant], className)}
    >
      {children}
    </button>
  );
}
