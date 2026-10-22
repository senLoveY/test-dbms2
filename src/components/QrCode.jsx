import { useEffect, useState } from "react";

/** QR code as inline SVG; the encoder loads only on pages that show one. */
export default function QrCode({ value, label }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then(({ default: QR }) => QR.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" }))
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(""));
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      className="qr"
      role="img"
      aria-label={label}
      // markup comes from the QR encoder, not from user input
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
