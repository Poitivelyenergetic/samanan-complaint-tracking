"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createComplaint } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToDepartments } from "@/lib/departments";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  type Administration,
  type Company,
  type ComplaintInput,
  type Department,
  type StaffUser,
} from "@/lib/types";
import ComplaintForm from "@/components/ComplaintForm";

export default function NewComplaintPage() {
  const t = useTranslations("complaint.new");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile, "complaints", "create")) {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  async function handleSubmit(values: ComplaintInput) {
    await createComplaint({ ...values, createdBy: user?.uid ?? null });
    router.back();
  }

  if (loading || !profile || !hasPermission(profile, "complaints", "create")) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>

      <div className="mt-6">
        <ComplaintForm
          staff={staff}
          companies={companies}
          administrations={administrations}
          departments={departments}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
