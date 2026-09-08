"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Navbar() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", key: "dashboard" as const },
    { href: "/complaints/new", key: "newComplaint" as const },
    ...(profile?.permissions.accessMarketing
      ? [{ href: "/marketing", key: "marketing" as const }]
      : []),
    ...(profile?.permissions.viewEmployees
      ? [{ href: "/companies", key: "companies" as const }]
      : []),
  ];

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/samnan-logo.svg" alt={tCommon("appName")} className="h-8 w-auto" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand/10 text-brand"
                      : "text-foreground/70 hover:bg-black/5"
                  }`}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          {profile && (
            <span className="text-sm text-foreground/60">
              {t("signedInAs")} <span className="font-medium text-foreground">{profile.name}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-black/5"
          >
            {t("logout")}
          </button>
        </div>

        <button
          type="button"
          className="md:hidden rounded-md border border-border p-2"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={t("dashboard")}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-border px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-black/5"
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/80"
            >
              {t("logout")}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
