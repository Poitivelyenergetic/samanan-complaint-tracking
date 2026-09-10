"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createCompany } from "@/lib/companies";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type CompanyInput, type StaffUser } from "@/lib/types";
import CompanyForm from "@/components/CompanyForm";

export default function NewCompanyPage() {
  const t = useTranslations("companies.new");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();

  const [staff, setStaff] = useState<StaffUser[]>([]);
  useEffect(() => subscribeToStaff(setStaff), []);

  async function handleSubmit(values: CompanyInput) {
    await createCompany(values);
    router.back();
  }

  if (loading || !profile || !hasPermission(profile, "companies", "create")) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <CompanyForm staff={staff} submitLabel={t("submit")} submittingLabel={tCommon("saving")} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
