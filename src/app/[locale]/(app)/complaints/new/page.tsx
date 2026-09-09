"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createComplaint } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type ComplaintInput, type StaffUser } from "@/lib/types";
import ComplaintForm from "@/components/ComplaintForm";

export default function NewComplaintPage() {
  const t = useTranslations("complaint.new");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile, "complaints", "create")) {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  async function handleSubmit(values: ComplaintInput) {
    const id = await createComplaint({ ...values, createdBy: user?.uid ?? null });
    router.push(`/complaints/${id}`);
  }

  if (loading || !profile || !hasPermission(profile, "complaints", "create")) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <ComplaintForm
          staff={staff}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
