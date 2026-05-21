export default function PageLayout({
  children,
  className = "",
  centered = true,
  wide = false,
}) {
  return (
    <main className={`app ${wide ? "app-wide" : ""}`}>
      <section
        className={`card ${centered ? "page-centered" : ""} ${className}`.trim()}
      >
        {children}
      </section>
    </main>
  );
}
