"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "@/i18n/navigation";

// The Employees module manages staff accounts and is restricted to admins.
// (The (app) layout above already guarantees the user is signed in.)
export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile && profile.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  if (loading || !profile || profile.role !== "admin") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-foreground/50">{t("loading")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
