"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
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
  // Each leaf nav item gets its own fixed accent color instead of the
  // uniform gray outline every icon used to share — makes the sidebar
  // scannable at a glance instead of every row looking identical. Only
  // applied while the row is inactive; an active row keeps its existing
  // solid brand background + white icon/text rather than fighting with it.
  iconColor?: string;
  badge?: number;
}

const SETTINGS_RESOURCE_ITEMS: {
  href: string;
  key: string;
  resource: PermissionResource;
  icon: ReactNode;
  iconColor: string;
}[] = [
  { href: "/companies", key: "companies", resource: "companies", icon: <IconBuilding />, iconColor: "#3b82f6" },
  { href: "/administrations", key: "administrations", resource: "administrations", icon: <IconBriefcase />, iconColor: "#6366f1" },
  { href: "/departments", key: "departments", resource: "departments", icon: <IconFolder />, iconColor: "#14b8a6" },
  { href: "/employees", key: "employees", resource: "employees", icon: <IconUsers />, iconColor: "#0ea5e9" },
  { href: "/roles", key: "roles", resource: "roles", icon: <IconShieldCheck />, iconColor: "#8b5cf6" },
];

function SidebarLink({
  href,
  label,
  icon,
  iconColor,
  active,
  onNavigate,
  badge,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  iconColor?: string;
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
      <span className="shrink-0" style={!active && iconColor ? { color: iconColor } : undefined}>
        {icon}
      </span>
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
  iconColor,
  active,
  onNavigate,
  badge,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  iconColor?: string;
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
      style={!active && iconColor ? { color: iconColor } : undefined}
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
              iconColor={item.iconColor}
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
  const locale = useLocale();
  const { profile, signOut } = useAuth();

  const [servicesOpen, setServicesOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [complaintsOpen, setComplaintsOpen] = useState(true);
  const [ticketsOpen, setTicketsOpen] = useState(true);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const visibleSettingsItems = SETTINGS_RESOURCE_ITEMS.filter((item) => hasPermission(profile, item.resource, "view"));
  const canViewAllComplaints = hasPermission(profile, "complaints", "viewAll");
  const canViewOwnComplaints = hasPermission(profile, "complaints", "view");
  const canCreateComplaints = hasPermission(profile, "complaints", "create");
  const canViewComplaintTypes = hasPermission(profile, "complaintTypes", "view");
  const canViewComplaintSources = hasPermission(profile, "complaintSources", "view");
  const canViewAllTickets = hasPermission(profile, "tickets", "viewAll");
  const canViewTicketTypes = hasPermission(profile, "ticketTypes", "view");
  const canViewTicketSources = hasPermission(profile, "ticketSources", "view");
  const canAccessMarketing = hasPermission(profile, "marketing", "view");
  const canReviewAccountRequests = hasPermission(profile, "employees", "update");

  const [pendingAccountRequests, setPendingAccountRequests] = useState(0);

  useEffect(() => {
    if (!canReviewAccountRequests) return;
    return subscribeToPendingSignupRequests((requests) => setPendingAccountRequests(requests.length));
  }, [canReviewAccountRequests]);

  const complaintsItems: NavItem[] = [
    ...(canViewAllComplaints
      ? [{ href: "/dashboard", label: t("dashboard"), icon: <IconClipboardList />, iconColor: "#6366f1" }]
      : []),
    ...(canViewOwnComplaints
      ? [{ href: "/my-complaints", label: t("myComplaints"), icon: <IconInbox />, iconColor: "#0ea5e9" }]
      : []),
    ...(canCreateComplaints
      ? [{ href: "/complaints/new", label: t("newComplaint"), icon: <IconPlusCircle />, iconColor: "#22c55e" }]
      : []),
    ...(canViewAllComplaints
      ? [{ href: "/complaints/inquiry", label: t("complaintInquiry"), icon: <IconSearch />, iconColor: "#8b5cf6" }]
      : []),
    ...(canViewComplaintTypes
      ? [{ href: "/complaint-types", label: t("complaintTypes"), icon: <IconTag />, iconColor: "#ec4899" }]
      : []),
    ...(canViewComplaintSources
      ? [{ href: "/complaint-sources", label: t("complaintSources"), icon: <IconBroadcast />, iconColor: "#f59e0b" }]
      : []),
  ];

  // Filing a ticket, "My Tickets", and Ticket Inquiry-of-your-own are open
  // to every signed-in employee by design — see lib/tickets.ts. Colors
  // mirror the Complaints group's role-for-role (list/mine/new/search/
  // tag/source) so the same color always means the same kind of item.
  const ticketItems: NavItem[] = [
    ...(canViewAllTickets
      ? [{ href: "/tickets", label: t("ticketsList"), icon: <IconClipboardList />, iconColor: "#6366f1" }]
      : []),
    { href: "/my-tickets", label: t("myTickets"), icon: <IconInbox />, iconColor: "#0ea5e9" },
    { href: "/tickets/new", label: t("newTicket"), icon: <IconPlusCircle />, iconColor: "#22c55e" },
    ...(canViewAllTickets
      ? [{ href: "/tickets/inquiry", label: t("ticketInquiry"), icon: <IconSearch />, iconColor: "#8b5cf6" }]
      : []),
    ...(canViewTicketTypes
      ? [{ href: "/ticket-types", label: t("ticketTypes"), icon: <IconTag />, iconColor: "#ec4899" }]
      : []),
    ...(canViewTicketSources
      ? [{ href: "/ticket-sources", label: t("ticketSources"), icon: <IconBroadcast />, iconColor: "#f59e0b" }]
      : []),
  ];

  const serviceItems: NavItem[] = [
    { href: "/receivables", label: t("receivables"), icon: <IconArrowDownCircle />, iconColor: "#22c55e" },
    { href: "/payables", label: t("payables"), icon: <IconArrowUpCircle />, iconColor: "#ef4444" },
    { href: "/sales-opportunities", label: t("salesOpportunities"), icon: <IconTrendingUp />, iconColor: "#3b82f6" },
    ...(canAccessMarketing
      ? [{ href: "/marketing", label: t("marketing"), icon: <IconMegaphone />, iconColor: "#ec4899" }]
      : []),
  ];

  const settingsItems: NavItem[] = [
    ...visibleSettingsItems.map((item) => ({
      href: item.href,
      label: t(item.key),
      icon: item.icon,
      iconColor: item.iconColor,
    })),
    ...(canReviewAccountRequests
      ? [
          {
            href: "/requests",
            label: t("requests"),
            icon: <IconInbox />,
            iconColor: "#f59e0b",
            badge: pendingAccountRequests,
          },
        ]
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
            iconColor="#3b82f6"
            active={pathname === "/home"}
            onNavigate={onNavigate}
          />
        ) : (
          <SidebarLink
            href="/home"
            label={t("home")}
            icon={<IconHome />}
            iconColor="#3b82f6"
            active={pathname === "/home"}
            onNavigate={onNavigate}
          />
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2">
        {collapsed ? (
          <div className="flex flex-col items-center space-y-1 pt-2">
            {[...complaintsItems, ...ticketItems, ...serviceItems, ...settingsItems].map((item) => (
              <SidebarIconLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                iconColor={item.iconColor}
                active={isActive(item.href)}
                onNavigate={onNavigate}
                badge={item.badge}
              />
            ))}
          </div>
        ) : (
          <>
            <NavGroup
              label={t("complaintsGroup")}
              icon={<IconClipboardList />}
              items={complaintsItems}
              open={complaintsOpen}
              onToggle={() => setComplaintsOpen((v) => !v)}
              isActive={isActive}
              onNavigate={onNavigate}
            />
            <NavGroup
              label={t("ticketsGroup")}
              icon={<IconTicket />}
              items={ticketItems}
              open={ticketsOpen}
              onToggle={() => setTicketsOpen((v) => !v)}
              isActive={isActive}
              onNavigate={onNavigate}
            />
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
        {/* Language is switched from the top bar's flags. */}
        {!collapsed && profile && (
          <p className="truncate text-sm text-[#aab2c5]">
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
          {collapsed ? (
            <span style={{ color: "#ef4444" }}>
              <IconLogout />
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span style={{ color: "#ef4444" }}>
                <IconLogout />
              </span>
              {t("logout")}
            </span>
          )}
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
        // Blown clean off the page if the idle cleaning crew's day goes really badly.
        data-crew-block
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
