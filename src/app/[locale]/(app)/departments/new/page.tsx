"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createDepartment } from "@/lib/departments";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type Administration, type DepartmentInput, type StaffUser } from "@/lib/types";
import DepartmentForm from "@/components/DepartmentForm";

export default function NewDepartmentPage() {
  const t = useTranslations("departments.new");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();

  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  async function handleSubmit(values: DepartmentInput) {
    await createDepartment(values);
    router.back();
  }

  if (loading || !profile || !hasPermission(profile, "departments", "create")) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <DepartmentForm
          administrations={administrations}
          staff={staff}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
