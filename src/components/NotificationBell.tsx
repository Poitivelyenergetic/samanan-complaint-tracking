"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToPendingReassignments } from "@/lib/complaints";
import { subscribeToPendingSignupRequests } from "@/lib/signupRequests";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type Complaint, type SignupRequest } from "@/lib/types";

interface NotificationItem {
  id: string;
  href: string;
  title: string;
  subtitle: string;
}

function storageKey(uid: string) {
  return `samnan-dismissed-notifications-${uid}`;
}

function loadDismissed(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(uid: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify([...ids]));
  } catch {
    // Best-effort — a private/blocked storage context just means
    // notifications won't stay dismissed across reloads.
  }
}

export default function NotificationBell() {
  const t = useTranslations("notifications");
  const { user, profile } = useAuth();
  const canReviewAccountRequests = hasPermission(profile, "employees", "update");
  const canReviewReassignmentRequests = hasPermission(profile, "complaints", "acceptReassignment");

  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>([]);
  const [reassignments, setReassignments] = useState<Complaint[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user) Promise.resolve().then(() => setDismissed(loadDismissed(user.uid)));
  }, [user]);

  useEffect(() => {
    if (!canReviewAccountRequests) return;
    return subscribeToPendingSignupRequests(setSignupRequests);
  }, [canReviewAccountRequests]);
  useEffect(() => {
    if (!canReviewReassignmentRequests) return;
    return subscribeToPendingReassignments(setReassignments);
  }, [canReviewReassignmentRequests]);

  const items: NotificationItem[] = [
    ...signupRequests.map((r) => ({
      id: `signup:${r.id}`,
      href: "/employees/requests",
      title: t("accountRequestTitle", { name: r.name }),
      subtitle: `${r.position} — ${r.administration}`,
    })),
    ...reassignments.map((c) => ({
      id: `reassignment:${c.id}`,
      href: "/requests/reassignments",
      title: t("reassignmentRequestTitle", { subject: c.subject }),
      subtitle: c.pendingReassignment?.reason ?? "",
    })),
  ];

  const visible = items.filter((item) => !dismissed.has(item.id));

  function dismiss(id: string) {
    if (!user) return;
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(user.uid, next);
      return next;
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("title")}
        className="relative rounded-full p-2 text-foreground/60 hover:bg-black/5 hover:text-foreground"
      >
        <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
          <path
            d="M5 8a5 5 0 0 1 10 0c0 3.5 1.2 4.5 1.2 4.5H3.8S5 11.5 5 8Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8.2 15.5a1.8 1.8 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {visible.length > 0 && (
          <span className="absolute -top-0.5 end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {visible.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 end-0 z-50 w-80 max-w-[85vw] border-s border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{t("title")}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("title")}
                className="rounded-md p-1.5 text-foreground/50 hover:bg-black/5"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="h-[calc(100%-3rem)] overflow-y-auto">
              {visible.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-foreground/50">{t("empty")}</p>
              ) : (
                <ul>
                  {visible.map((item) => (
                    <li key={item.id} className="border-b border-border last:border-0">
                      <Link
                        href={item.href}
                        onClick={() => {
                          dismiss(item.id);
                          setOpen(false);
                        }}
                        className="block px-4 py-3 hover:bg-black/[0.02]"
                      >
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        {item.subtitle && <p className="mt-0.5 text-xs text-foreground/60">{item.subtitle}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
