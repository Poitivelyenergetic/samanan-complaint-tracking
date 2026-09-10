"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useAuth } from "@/lib/auth-context";
import { subscribeToPendingSignupRequests } from "@/lib/signupRequests";
import { subscribeToPendingReassignments } from "@/lib/complaints";
import { hasPermission, localizedName, type PermissionResource } from "@/lib/types";

const SETTINGS_ITEMS: { href: string; key: string; resource: PermissionResource }[] = [
  { href: "/companies", key: "companies", resource: "companies" },
  { href: "/administrations", key: "administrations", resource: "administrations" },
  { href: "/departments", key: "departments", resource: "departments" },
  { href: "/employees", key: "employees", resource: "employees" },
  { href: "/roles", key: "roles", resource: "roles" },
];

const LOCALE_LABELS: Record<string, string> = { ar: "العربية", en: "English" };

function SidebarLink({ href, label, active, onNavigate }: { href: string; label: string; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-brand text-brand-foreground" : "text-[#aab2c5] hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const { profile, signOut } = useAuth();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const visibleSettingsItems = SETTINGS_ITEMS.filter((item) => hasPermission(profile, item.resource, "view"));
  const canViewComplaints = hasPermission(profile, "complaints", "view");
  const canViewAllComplaints = hasPermission(profile, "complaints", "viewAll");
  const canCreateComplaints = hasPermission(profile, "complaints", "create");
  const canAccessMarketing = hasPermission(profile, "marketing", "view");
  const canReviewAccountRequests = hasPermission(profile, "employees", "update");
  const canReviewReassignmentRequests = hasPermission(profile, "complaints", "acceptReassignment");
  const canViewRequests = canReviewAccountRequests || canReviewReassignmentRequests;

  const [pendingAccountRequests, setPendingAccountRequests] = useState(0);
  const [pendingReassignmentRequests, setPendingReassignmentRequests] = useState(0);
  const pendingRequestsCount = pendingAccountRequests + pendingReassignmentRequests;

  useEffect(() => {
    if (!canReviewAccountRequests) return;
    return subscribeToPendingSignupRequests((requests) => setPendingAccountRequests(requests.length));
  }, [canReviewAccountRequests]);
  useEffect(() => {
    if (!canReviewReassignmentRequests) return;
    return subscribeToPendingReassignments((complaints) => setPendingReassignmentRequests(complaints.length));
  }, [canReviewReassignmentRequests]);

  return (
    <div className="flex h-full flex-col bg-[#1f2430] text-[#aab2c5]">
      <div className="flex items-center gap-2 px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/samnan-logo.svg" alt={tCommon("appName")} className="h-8 w-auto brightness-0 invert" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {canViewComplaints && (
          <SidebarLink
            href="/dashboard"
            label={canViewAllComplaints ? t("dashboard") : t("tasks")}
            active={isActive("/dashboard")}
            onNavigate={onNavigate}
          />
        )}
        {canCreateComplaints && (
          <SidebarLink href="/complaints/new" label={t("newComplaint")} active={isActive("/complaints/new")} onNavigate={onNavigate} />
        )}
        {canAccessMarketing && (
          <SidebarLink href="/marketing" label={t("marketing")} active={isActive("/marketing")} onNavigate={onNavigate} />
        )}

        {(visibleSettingsItems.length > 0 || canViewRequests) && (
          <div className="pt-3">
            <p className="px-3 text-xs font-bold text-brand">{t("settings")}</p>
            <div className="mt-1 space-y-1">
              {visibleSettingsItems.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={t(item.key)}
                  active={isActive(item.href)}
                  onNavigate={onNavigate}
                />
              ))}
              {canViewRequests && (
                <Link
                  href="/requests"
                  onClick={onNavigate}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive("/requests") ? "bg-brand text-brand-foreground" : "text-[#aab2c5] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {t("requests")}
                  {pendingRequestsCount > 0 && (
                    <span className="ms-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-xs font-semibold text-white">
                      {pendingRequestsCount}
                    </span>
                  )}
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-1">
          {routing.locales.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => router.replace(pathname, { locale: loc })}
              className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                loc === locale ? "bg-brand text-brand-foreground" : "text-[#aab2c5] hover:bg-white/5 hover:text-white"
              }`}
              aria-current={loc === locale}
            >
              {LOCALE_LABELS[loc]}
            </button>
          ))}
        </div>
        {profile && (
          <p className="mt-2.5 truncate text-xs text-[#aab2c5]">
            {t("signedInAs")} <span className="font-medium text-white">{localizedName(profile, locale)}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          className="mt-2 w-full rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-[#aab2c5] transition-colors hover:bg-white/5 hover:text-white"
        >
          {t("logout")}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const t = useTranslations("nav");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="hidden w-60 shrink-0 md:block">
        <SidebarContents />
      </aside>

      <div className="flex items-center justify-between border-b border-border bg-[#1f2430] px-4 py-3 md:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/samnan-logo.svg" alt={t("dashboard")} className="h-7 w-auto brightness-0 invert" />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label={t("dashboard")}
          className="rounded-md border border-white/10 p-2 text-[#aab2c5]"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[80vw] bg-[#1f2430] shadow-xl">
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t("logout")}
                className="rounded-md p-2 text-[#aab2c5] hover:bg-white/5"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="h-[calc(100%-3rem)]">
              <SidebarContents onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
