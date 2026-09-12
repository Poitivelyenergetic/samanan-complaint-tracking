"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useAuth } from "@/lib/auth-context";
import { subscribeToPendingSignupRequests } from "@/lib/signupRequests";
import { hasPermission, localizedName, type PermissionResource } from "@/lib/types";
import {
  IconArrowDownCircle,
  IconArrowUpCircle,
  IconBriefcase,
  IconBroadcast,
  IconBuilding,
  IconChevronDown,
  IconChevronsRight,
  IconClipboardList,
  IconFolder,
  IconGear,
  IconHome,
  IconInbox,
  IconLayoutGrid,
  IconLogout,
  IconMegaphone,
  IconPlusCircle,
  IconSearch,
  IconShieldCheck,
  IconTag,
  IconTicket,
  IconTrendingUp,
  IconUsers,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

const SETTINGS_RESOURCE_ITEMS: { href: string; key: string; resource: PermissionResource; icon: ReactNode }[] = [
  { href: "/companies", key: "companies", resource: "companies", icon: <IconBuilding /> },
  { href: "/administrations", key: "administrations", resource: "administrations", icon: <IconBriefcase /> },
  { href: "/departments", key: "departments", resource: "departments", icon: <IconFolder /> },
  { href: "/employees", key: "employees", resource: "employees", icon: <IconUsers /> },
  { href: "/roles", key: "roles", resource: "roles", icon: <IconShieldCheck /> },
  { href: "/complaint-types", key: "complaintTypes", resource: "complaintTypes", icon: <IconTag /> },
  { href: "/complaint-sources", key: "complaintSources", resource: "complaintSources", icon: <IconBroadcast /> },
];

const LOCALE_LABELS: Record<string, string> = { ar: "العربية", en: "English" };

function SidebarLink({
  href,
  label,
  icon,
  active,
  onNavigate,
  badge,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onNavigate?: () => void;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium transition-colors ${
        active ? "bg-brand text-brand-foreground" : "text-[#aab2c5] hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {!!badge && (
        <span className="ms-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-xs font-semibold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

// Collapsed-sidebar equivalent of SidebarLink — icon only, centered, with the
// label as a title tooltip since there's no room to render it. A pending
// count shows as a small dot rather than a number badge for the same reason.
function SidebarIconLink({
  href,
  label,
  icon,
  active,
  onNavigate,
  badge,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onNavigate?: () => void;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={label}
      aria-label={label}
      className={`relative flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
        active ? "bg-brand text-brand-foreground" : "text-[#aab2c5] hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon}
      {!!badge && <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
    </Link>
  );
}

function NavGroup({
  label,
  icon,
  items,
  open,
  onToggle,
  isActive,
  onNavigate,
}: {
  label: string;
  icon: ReactNode;
  items: NavItem[];
  open: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-bold text-brand transition-colors hover:bg-white/5"
      >
        <span className="flex items-center gap-3">
          <span className={`flex shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}>{icon}</span>
          {label}
        </span>
        <IconChevronDown className={`shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {items.map((item) => (
            <SidebarLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              onNavigate={onNavigate}
              badge={item.badge}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContents({
  collapsible = false,
  open = true,
  onToggleOpen,
  onNavigate,
}: {
  // Only the desktop rail supports collapsing to icons-only — the mobile
  // drawer is always shown at full width, so it renders with collapsible
  // left at its default (false) and open forced true.
  collapsible?: boolean;
  open?: boolean;
  onToggleOpen?: () => void;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const { profile, signOut } = useAuth();

  const [servicesOpen, setServicesOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const visibleSettingsItems = SETTINGS_RESOURCE_ITEMS.filter((item) => hasPermission(profile, item.resource, "view"));
  const canViewComplaints = hasPermission(profile, "complaints", "view");
  const canViewAllComplaints = hasPermission(profile, "complaints", "viewAll");
  const canCreateComplaints = hasPermission(profile, "complaints", "create");
  const canUseComplaintInquiry = hasPermission(profile, "complaints", "viewAll");
  const canAccessMarketing = hasPermission(profile, "marketing", "view");
  const canReviewAccountRequests = hasPermission(profile, "employees", "update");

  const [pendingAccountRequests, setPendingAccountRequests] = useState(0);

  useEffect(() => {
    if (!canReviewAccountRequests) return;
    return subscribeToPendingSignupRequests((requests) => setPendingAccountRequests(requests.length));
  }, [canReviewAccountRequests]);

  const serviceItems: NavItem[] = [
    ...(canViewComplaints
      ? [{ href: "/dashboard", label: canViewAllComplaints ? t("dashboard") : t("tasks"), icon: <IconClipboardList /> }]
      : []),
    ...(canCreateComplaints ? [{ href: "/complaints/new", label: t("newComplaint"), icon: <IconPlusCircle /> }] : []),
    ...(canUseComplaintInquiry
      ? [{ href: "/complaints/inquiry", label: t("complaintInquiry"), icon: <IconSearch /> }]
      : []),
    { href: "/receivables", label: t("receivables"), icon: <IconArrowDownCircle /> },
    { href: "/payables", label: t("payables"), icon: <IconArrowUpCircle /> },
    { href: "/sales-opportunities", label: t("salesOpportunities"), icon: <IconTrendingUp /> },
    ...(canAccessMarketing ? [{ href: "/marketing", label: t("marketing"), icon: <IconMegaphone /> }] : []),
    { href: "/tickets", label: t("tickets"), icon: <IconTicket /> },
  ];

  const settingsItems: NavItem[] = [
    ...visibleSettingsItems.map((item) => ({ href: item.href, label: t(item.key), icon: item.icon })),
    ...(canReviewAccountRequests
      ? [{ href: "/requests", label: t("requests"), icon: <IconInbox />, badge: pendingAccountRequests }]
      : []),
  ];

  const collapsed = collapsible && !open;

  return (
    <div className="flex h-full flex-col bg-[#1f2430] text-[#aab2c5]">
      <div className={`flex items-center py-4 ${collapsed ? "justify-center px-0" : "px-4"}`}>
        <Link href="/home" onClick={onNavigate} className="inline-block">
          {collapsed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/samnan-icon.svg" alt={tCommon("appName")} className="h-8 w-8 brightness-0 invert" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/samnan-logo.svg" alt={tCommon("appName")} className="h-8 w-auto brightness-0 invert" />
          )}
        </Link>
      </div>

      <div className={collapsed ? "flex justify-center px-2 pb-2" : "px-2 pb-2"}>
        {collapsed ? (
          <SidebarIconLink
            href="/home"
            label={t("home")}
            icon={<IconHome />}
            active={pathname === "/home"}
            onNavigate={onNavigate}
          />
        ) : (
          <SidebarLink href="/home" label={t("home")} icon={<IconHome />} active={pathname === "/home"} onNavigate={onNavigate} />
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2">
        {collapsed ? (
          <div className="flex flex-col items-center space-y-1 pt-2">
            {[...serviceItems, ...settingsItems].map((item) => (
              <SidebarIconLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
                onNavigate={onNavigate}
                badge={item.badge}
              />
            ))}
          </div>
        ) : (
          <>
            <NavGroup
              label={t("services")}
              icon={<IconLayoutGrid />}
              items={serviceItems}
              open={servicesOpen}
              onToggle={() => setServicesOpen((v) => !v)}
              isActive={isActive}
              onNavigate={onNavigate}
            />
            <NavGroup
              label={t("settings")}
              icon={<IconGear />}
              items={settingsItems}
              open={settingsOpen}
              onToggle={() => setSettingsOpen((v) => !v)}
              isActive={isActive}
              onNavigate={onNavigate}
            />
          </>
        )}
      </nav>

      <div className={`border-t border-white/10 py-3 ${collapsed ? "px-2" : "px-4"}`}>
        {!collapsed && (
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
        )}
        {!collapsed && profile && (
          <p className="mt-2.5 truncate text-sm text-[#aab2c5]">
            {t("signedInAs")} <span className="font-medium text-white">{localizedName(profile, locale)}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          title={collapsed ? t("logout") : undefined}
          aria-label={collapsed ? t("logout") : undefined}
          className={
            collapsed
              ? "mx-auto mt-2 flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-[#aab2c5] transition-colors hover:bg-white/5 hover:text-white"
              : "mt-2 w-full rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-[#aab2c5] transition-colors hover:bg-white/5 hover:text-white"
          }
        >
          {collapsed ? <IconLogout /> : t("logout")}
        </button>
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-sm font-medium text-[#aab2c5] transition-colors hover:bg-white/5 hover:text-white"
        >
          <span className={`flex shrink-0 transition-transform duration-300 ${open ? "" : "rotate-180"}`}>
            <IconChevronsRight />
          </span>
          {open && t("hideSidebar")}
        </button>
      )}
    </div>
  );
}

export default function Sidebar() {
  const t = useTranslations("nav");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  return (
    <>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 transition-all duration-300 ease-in-out md:block ${desktopOpen ? "w-64" : "w-16"}`}
      >
        <SidebarContents collapsible open={desktopOpen} onToggleOpen={() => setDesktopOpen((v) => !v)} />
      </aside>

      <div className="flex items-center justify-between border-b border-border bg-[#1f2430] px-4 py-3 md:hidden">
        <Link href="/home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/samnan-logo.svg" alt={t("dashboard")} className="h-7 w-auto brightness-0 invert" />
        </Link>
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
