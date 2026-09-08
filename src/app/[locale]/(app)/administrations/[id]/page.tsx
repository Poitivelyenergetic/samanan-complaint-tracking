"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getAdministration, updateAdministration } from "@/lib/administrations";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type Administration, type AdministrationInput, type Company, type StaffUser } from "@/lib/types";
import AdministrationForm from "@/components/AdministrationForm";

export default function EditAdministrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("administrations.edit");
  const tCommon = useTranslations("common");
  const { profile, loading } = useAuth();
  const canUpdate = hasPermission(profile, "administrations", "update");

  const [administration, setAdministration] = useState<Administration | null | undefined>(undefined);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => {
    getAdministration(id).then(setAdministration);
  }, [id]);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  async function handleSubmit(values: AdministrationInput) {
    await updateAdministration(id, values);
  }

  if (loading || !profile || !canUpdate || administration === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (administration === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/administrations" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/administrations" className="text-sm text-brand hover:underline">
        &larr; {tCommon("back")}
      </Link>
      <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <AdministrationForm
          key={administration.id}
          companies={companies}
          staff={staff}
          initialValues={administration}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
