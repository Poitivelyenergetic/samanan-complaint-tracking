// Small stroke-style icon set for the sidebar nav — matches the existing
// 20x20 viewBox / strokeWidth 1.5 style already used by ThemeToggle and the
// mobile menu icons in Sidebar.tsx.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function IconClipboardList(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="3.5" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 2.5h5a1 1 0 0 1 1 1v1h-7v-1a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 8.5h6M7 11.5h6M7 14.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Base>
  );
}

export function IconPlusCircle(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.75v6.5M6.75 10h6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Base>
  );
}

export function IconMegaphone(props: IconProps) {
  return (
    <Base {...props}>
      <path
        d="M3 8.2v3.6h1.8l7.7 2.9V5.3l-7.7 2.9H3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6.5 11.8v2.7a1.2 1.2 0 0 0 2.4 0v-1.9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14.7 7.8a2.6 2.6 0 0 1 0 4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Base>
  );
}

export function IconArrowDownCircle(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.25v7.5M6.75 10.75 10 13.75l3.25-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function IconArrowUpCircle(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 13.75v-7.5M6.75 9.25 10 6.25l3.25 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function IconTicket(props: IconProps) {
  return (
    <Base {...props}>
      <path
        d="M3 7.5a1.25 1.25 0 0 0 0-2.5V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1a1.25 1.25 0 0 0 0 2.5v1a1.25 1.25 0 0 0 0 2.5V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1a1.25 1.25 0 0 0 0-2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M11 3.5v13" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.6 1.8" strokeLinecap="round" />
    </Base>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4.5" y="2.5" width="11" height="15" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 5.5h1.5M11 5.5h1.5M7.5 8.5h1.5M11 8.5h1.5M7.5 11.5h1.5M11 11.5h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.25 17.5V15a1.75 1.75 0 0 1 3.5 0v2.5" stroke="currentColor" strokeWidth="1.5" />
    </Base>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="6.5" width="14" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 13 5v1.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 10.5h14" stroke="currentColor" strokeWidth="1.5" />
    </Base>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Base {...props}>
      <path
        d="M3 5.5A1 1 0 0 1 4 4.5h3.5l1.5 1.75H16a1 1 0 0 1 1 1V14.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </Base>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="7.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 16v-.5A3.5 3.5 0 0 1 6.5 12h2A3.5 3.5 0 0 1 12 15.5V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.5 8a2.25 2.25 0 1 0 0-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.5 12.1c1.6.3 2.8 1.5 2.8 3.4V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Base>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path
        d="M10 2.5 16 4.5v4.8c0 4-2.6 6.7-6 8.2-3.4-1.5-6-4.2-6-8.2V4.5L10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.3 10 9.2 11.9 13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <Base {...props}>
      <path
        d="M3.5 10.5h3.3l1 1.8h4.4l1-1.8h3.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M4.3 5.2A1 1 0 0 1 5.2 4.5h9.6a1 1 0 0 1 .9.7l1.8 5.4v4.4a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-4.4l1.8-5.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </Base>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="8.75" cy="8.75" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16.5 16.5 12.8 12.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Base>
  );
}

export function IconTrendingUp(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 14.5 8 9.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 6.5H17v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function IconGear(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 3.5v1.7M10 14.8v1.7M16.5 10h-1.7M5.2 10H3.5M14.6 5.4l-1.2 1.2M6.6 13.4l-1.2 1.2M14.6 14.6l-1.2-1.2M6.6 6.6 5.4 5.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Base>
  );
}

export function IconLayoutGrid(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </Base>
  );
}
