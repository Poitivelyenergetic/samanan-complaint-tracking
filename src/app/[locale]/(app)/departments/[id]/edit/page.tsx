"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getDepartment, updateDepartment } from "@/lib/departments";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type Administration, type Department, type DepartmentInput, type StaffUser } from "@/lib/types";
import DepartmentForm from "@/components/DepartmentForm";

export default function EditDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("departments.edit");
  const tCommon = useTranslations("common");
  const { profile, loading } = useAuth();
  const canUpdate = hasPermission(profile, "departments", "update");

  const [department, setDepartment] = useState<Department | null | undefined>(undefined);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => {
    getDepartment(id).then(setDepartment);
  }, [id]);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  async function handleSubmit(values: DepartmentInput) {
    await updateDepartment(id, values);
  }

  if (loading || !profile || !canUpdate || department === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (department === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/departments" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/departments/${id}`} className="text-sm text-brand hover:underline">
        &larr; {tCommon("back")}
      </Link>
      <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <DepartmentForm
          key={department.id}
          administrations={administrations}
          staff={staff}
          initialValues={department}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
