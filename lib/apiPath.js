function first(value) {
  if (Array.isArray(value)) return value[0];
  return value || "";
}

/** Parse /api/<group>/... whether Vercel kept the original path or rewrote it. */
export function getApiParts(req, group) {
  const headerPath = [
    req.headers["x-invoke-path"],
    req.headers["x-matched-path"],
    req.headers["x-real-url"],
  ]
    .map((value) => (value ? String(value).split("?")[0] : ""))
    .find((value) => value.includes(`/api/${group}`));

  const pathname = (headerPath || String(req.url || "")).split("?")[0];
  const after = pathname.split(`/api/${group}`)[1] || "";
  const fromPath = after.split("/").filter(Boolean);

  const query = req.query || {};
  const fromQuery = [first(query.action), first(query.id), first(query.extra)].filter(
    Boolean
  );

  return fromPath.length ? fromPath : fromQuery;
}
