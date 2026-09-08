"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getCompany, updateCompany } from "@/lib/companies";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type Company, type CompanyInput, type StaffUser } from "@/lib/types";
import CompanyForm from "@/components/CompanyForm";

export default function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("companies.edit");
  const tCommon = useTranslations("common");
  const { profile, loading } = useAuth();
  const canUpdate = hasPermission(profile, "companies", "update");

  const [company, setCompany] = useState<Company | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => {
    getCompany(id).then(setCompany);
  }, [id]);
  useEffect(() => subscribeToStaff(setStaff), []);

  async function handleSubmit(values: CompanyInput) {
    await updateCompany(id, values);
  }

  if (loading || !profile || !canUpdate || company === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (company === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/companies" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/companies" className="text-sm text-brand hover:underline">
        &larr; {tCommon("back")}
      </Link>
      <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <CompanyForm
          key={company.id}
          staff={staff}
          initialValues={company}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
