/**
 * Native share sheet on phones, clipboard elsewhere.
 * @returns {Promise<"shared" | "copied" | "cancelled">}
 */
export async function shareLink({ title, text, url }) {
  if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // fall through to the clipboard
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}

export function quizShareUrl(id) {
  return `${window.location.origin}/q/${id}`;
}

/** Only same-site paths, so ?next= can't send people to another origin. */
export function safeNextPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}
