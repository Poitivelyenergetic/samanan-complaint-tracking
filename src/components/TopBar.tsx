"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { localizedName } from "@/lib/types";
import { IconLogout } from "./icons";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitcher from "./LanguageSwitcher";
import LiveClock from "./LiveClock";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]).join("");
  return initials.toUpperCase() || "?";
}

export default function TopBar() {
  const t = useTranslations("nav");
  const tTheme = useTranslations("theme");
  const locale = useLocale();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!profile) return null;

  const name = localizedName(profile, locale) || profile.username;

  return (
    <div data-crew-block className="flex items-center justify-end gap-3 border-b border-border bg-surface px-4 py-2.5 lg:grid lg:grid-cols-[1fr_auto_1fr]">
      <div className="hidden lg:block" />
      <LiveClock />
      <div className="flex items-center justify-end gap-2">
        <LanguageSwitcher compact />
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            title={name}
            // The idle cleaning crew's gondola comes to dust this off.
            data-crew-pfp
            className="block h-8 w-8 shrink-0 overflow-hidden rounded-full"
          >
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="h-8 w-8 object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center bg-brand text-xs font-semibold text-brand-foreground">
                {initialsOf(name)}
              </div>
            )}
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute end-0 z-50 mt-2 w-64 rounded-lg border border-border bg-surface shadow-xl">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-foreground/50">
                    <circle cx="10" cy="6.5" r="3.25" stroke="currentColor" strokeWidth="1.5" />
                    <path
                      d="M3.5 17c0-3.31 2.91-6 6.5-6s6.5 2.69 6.5 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <p className="text-sm font-semibold text-foreground">{name}</p>
                </div>

                <div className="p-1.5">
                  <Link
                    href="/account"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-black/5"
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
                      <path
                        d="M4 17c0-2.9 2.69-5.25 6-5.25s6 2.35 6 5.25"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    {t("profile")}
                  </Link>
                  {/* Picking one leaves the menu open, so the change can be seen
                      behind it. */}
                  <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-foreground">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M10 2.75a7.25 7.25 0 1 0 0 14.5c.97 0 1.5-.6 1.5-1.35 0-.4-.16-.72-.4-.98-.24-.26-.38-.57-.38-.95 0-.8.63-1.42 1.43-1.42h1.6a3.5 3.5 0 0 0 3.5-3.5c0-3.45-3.25-6.3-7.25-6.3Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <circle cx="6.5" cy="9.5" r="1" fill="currentColor" />
                      <circle cx="8.75" cy="6.25" r="1" fill="currentColor" />
                      <circle cx="12.5" cy="6.5" r="1" fill="currentColor" />
                    </svg>
                    {tTheme("title")}
                    <ThemeToggle className="ms-auto" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-sm text-foreground hover:bg-black/5"
                  >
                    <IconLogout width={16} height={16} />
                    {t("logout")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <NotificationBell />
      </div>
    </div>
  );
}
