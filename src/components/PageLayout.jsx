/** Page container. width: narrow | default | wide */
export default function PageLayout({ children, className = "", width = "default" }) {
  return <div className={`page page-${width} ${className}`.trim()}>{children}</div>;
}

export function PageHeader({ eyebrow, title, lead, actions, children }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && <h1 className="page-title">{title}</h1>}
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
