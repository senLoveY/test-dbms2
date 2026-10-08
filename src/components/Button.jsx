import { Link } from "react-router-dom";

const VARIANTS = ["primary", "secondary", "accent", "ghost", "danger", "danger-solid"];

/**
 * Unified button / router link.
 * variant: primary | secondary | accent | ghost | danger | danger-solid
 * size: md | sm | lg
 */
export default function Button({
  variant = "primary",
  size = "md",
  to,
  block = false,
  loading = false,
  disabled = false,
  kbd,
  className = "",
  children,
  ...props
}) {
  const safeVariant = VARIANTS.includes(variant) ? variant : "primary";
  const classes = [
    "btn",
    `btn-${safeVariant}`,
    size !== "md" ? `btn-${size}` : "",
    block ? "btn-block" : "",
    loading ? "btn-loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {loading && <span className="spinner" aria-hidden="true" />}
      <span className="btn-label">{children}</span>
      {kbd && <kbd className="btn-kbd">{kbd}</kbd>}
    </>
  );

  if (to && !disabled) {
    return (
      <Link className={classes} to={to} {...props}>
        {content}
      </Link>
    );
  }

  return (
    <button className={classes} type="button" disabled={disabled || loading} {...props}>
      {content}
    </button>
  );
}
