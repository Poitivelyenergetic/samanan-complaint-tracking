"use client";

import { useTranslations } from "next-intl";

// Drop-in replacement for the plain "Loading..." text every page used to
// show on its own initial-data guard — same text, same size/color, just
// with a spinning indicator so the wait reads as something happening
// rather than static text sitting on the page.
export default function Spinner({ className = "" }: { className?: string }) {
  const t = useTranslations("common");
  return (
    <p className={`inline-flex items-center gap-2 text-sm text-foreground/50 ${className}`}>
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
      {t("loading")}
    </p>
  );
}
