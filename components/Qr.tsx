"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Render a QR code for `value` as a data-URL image. Client-side only. */
export function Qr({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: "#0e1418", light: "#f6f9fa" },
    })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="QR" style={{ borderRadius: 12 }} />;
}
