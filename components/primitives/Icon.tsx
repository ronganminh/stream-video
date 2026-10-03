import type { HTMLAttributes } from "react";

export type IconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  name: string;
};

export function Icon({
  name,
  className,
  "aria-hidden": ariaHidden = true,
  ...props
}: IconProps) {
  const classes = className
    ? `material-symbols-rounded ${className}`
    : "material-symbols-rounded";

  return (
    <span {...props} className={classes} aria-hidden={ariaHidden}>
      {name}
    </span>
  );
}
