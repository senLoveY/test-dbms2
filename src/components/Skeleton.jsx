export function SkeletonLines({ rows = 3 }) {
  return (
    <div className="skeleton-stack" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton skeleton-row" key={index} style={{ "--i": index }} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page page-narrow">
      <div className="skeleton skeleton-eyebrow" />
      <div className="skeleton skeleton-title" />
      <SkeletonLines rows={3} />
    </div>
  );
}
