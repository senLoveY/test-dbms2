import { Link } from "react-router-dom";

const VARIANTS = ["primary", "secondary", "accent", "danger"];

/**
 * Unified button / router link.
 * variant: primary | secondary | accent | danger
 */
export default function Button({
  variant = "primary",
  to,
  block = false,
  className = "",
  children,
  ...props
}) {
  const safeVariant = VARIANTS.includes(variant) ? variant : "primary";
  const classes = [
    "btn",
    `btn-${safeVariant}`,
    block ? "btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (to) {
    return (
      <Link className={classes} to={to} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} type="button" {...props}>
      {children}
    </button>
  );
}
