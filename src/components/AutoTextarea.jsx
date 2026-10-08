import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";

/** Textarea that grows with its content. */
const AutoTextarea = forwardRef(function AutoTextarea({ value, minRows = 2, ...props }, ref) {
  const innerRef = useRef(null);

  const setRefs = useCallback(
    (node) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [value]);

  return <textarea ref={setRefs} rows={minRows} value={value} {...props} />;
});

export default AutoTextarea;
