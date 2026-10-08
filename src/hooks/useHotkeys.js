import { useEffect, useRef } from "react";

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Global keyboard shortcuts, ignored while typing or when a dialog is open.
 * handlers: { "Enter": fn, "ArrowLeft": fn, digit: (n) => {} }
 */
export function useHotkeys(handlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;

    function onKeyDown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector("dialog[open]")) return;

      const map = ref.current;
      if (map.digit && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        map.digit(Number(event.key) - 1);
        return;
      }
      const handler = map[event.key];
      if (handler) {
        // let Enter/Space activate a focused button normally
        if ((event.key === "Enter" || event.key === " ") && event.target.closest?.("button, a")) {
          return;
        }
        event.preventDefault();
        handler(event);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
