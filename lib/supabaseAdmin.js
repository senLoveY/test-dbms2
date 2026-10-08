import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

let adminClient;

function normalizeSupabaseUrl(raw) {
  if (!raw) return "";
  return raw.trim().replace(/\/+$/, "").replace(/\/rest\/v1\/?$/i, "");
}

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}

/** Verified tokens survive between invocations of a warm function instance. */
const TOKEN_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map();

function readCachedUser(token) {
  const entry = tokenCache.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    tokenCache.delete(token);
    return null;
  }
  return entry.user;
}

function cacheUser(token, user, jwtExpSec) {
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    tokenCache.delete(tokenCache.keys().next().value);
  }
  const jwtExpiresAt = jwtExpSec ? jwtExpSec * 1000 : Infinity;
  tokenCache.set(token, {
    user,
    expiresAt: Math.min(Date.now() + TOKEN_CACHE_TTL_MS, jwtExpiresAt),
  });
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

/**
 * Legacy HS256 projects: verify with SUPABASE_JWT_SECRET without calling Auth.
 * Returns claims, or null when local verification isn't possible.
 */
function verifyHs256(token) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  const [rawHeader, rawPayload, signature] = token.split(".");
  if (!rawHeader || !rawPayload || !signature) return null;

  const header = decodeSegment(rawHeader);
  if (header.alg !== "HS256") return null;

  const expected = createHmac("sha256", secret).update(`${rawHeader}.${rawPayload}`).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid JWT signature");
  }

  const claims = decodeSegment(rawPayload);
  if (claims.exp && claims.exp * 1000 <= Date.now()) {
    throw new Error("JWT expired");
  }
  return claims;
}

export async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return { user: null, error: "Missing authorization token" };

  const cached = readCachedUser(token);
  if (cached) return { user: cached, error: null };

  try {
    // Asymmetric signing keys → verified locally via cached JWKS;
    // otherwise SUPABASE_JWT_SECRET; otherwise getClaims falls back to the Auth API.
    let claims = verifyHs256(token);
    if (!claims) {
      const { data, error } = await getSupabaseAdmin().auth.getClaims(token);
      if (error || !data?.claims) throw error || new Error("Invalid token");
      claims = data.claims;
    }

    if (!claims.sub || claims.role !== "authenticated") {
      return { user: null, error: "Invalid or expired token" };
    }

    const user = { id: claims.sub, email: claims.email };
    cacheUser(token, user, claims.exp);
    return { user, error: null };
  } catch {
    return { user: null, error: "Invalid or expired token" };
  }
}
