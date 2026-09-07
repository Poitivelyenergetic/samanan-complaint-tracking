"use client";

import { useTranslations } from "next-intl";
import LanguageSwitcher from "./LanguageSwitcher";

export default function PublicShell({
  children,
  maxWidthClassName = "max-w-sm",
}: {
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-12">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <div className={`w-full ${maxWidthClassName}`}>{children}</div>
    </div>
  );
}

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  const tCommon = useTranslations("common");
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/samnan-logo.svg" alt={tCommon("appName")} className="h-11 w-auto" />
      {subtitle && <p className="mt-2 text-sm text-foreground/60">{subtitle}</p>}
    </div>
  );
}
