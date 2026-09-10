"use client";

import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { localizedName } from "@/lib/types";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]).join("");
  return initials.toUpperCase() || "?";
}

export default function TopBar() {
  const locale = useLocale();
  const { profile } = useAuth();

  if (!profile) return null;

  const name = localizedName(profile, locale) || profile.username;

  return (
    <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
      <ThemeToggle />
      <div className="flex items-center gap-2">
        <Link href="/account" title={name} className="block h-8 w-8 shrink-0 overflow-hidden rounded-full">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt="" className="h-8 w-8 object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center bg-brand text-xs font-semibold text-brand-foreground">
              {initialsOf(name)}
            </div>
          )}
        </Link>
        <NotificationBell />
      </div>
    </div>
  );
}
