import PageLayout from "./PageLayout.jsx";

export default function AuthLayout({ title, lead, children, footer }) {
  return (
    <PageLayout width="narrow" className="auth">
      <h1 className="page-title">{title}</h1>
      {lead && <p className="lead">{lead}</p>}
      {children}
      {footer && <p className="auth-footer">{footer}</p>}
    </PageLayout>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
