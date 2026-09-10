"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createAdministration } from "@/lib/administrations";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type AdministrationInput, type Company, type StaffUser } from "@/lib/types";
import AdministrationForm from "@/components/AdministrationForm";

export default function NewAdministrationPage() {
  const t = useTranslations("administrations.new");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  async function handleSubmit(values: AdministrationInput) {
    await createAdministration(values);
    router.back();
  }

  if (loading || !profile || !hasPermission(profile, "administrations", "create")) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <AdministrationForm
          companies={companies}
          staff={staff}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
