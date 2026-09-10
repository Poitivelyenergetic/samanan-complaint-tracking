"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { subscribeToStaffMember } from "@/lib/users";
import { updateEmployee } from "@/lib/employees-api";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToDepartments } from "@/lib/departments";
import { subscribeToRoles } from "@/lib/roles";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  type Administration,
  type Company,
  type Department,
  type EmployeeInput,
  type Role,
  type StaffUser,
} from "@/lib/types";
import EmployeeForm from "@/components/EmployeeForm";

export default function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("employees.edit");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canUpdate = hasPermission(profile, "employees", "update");

  const [staff, setStaff] = useState<StaffUser | null | undefined>(undefined);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => subscribeToStaffMember(id, setStaff), [id]);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToRoles(setRoles), []);

  useEffect(() => {
    if (!loading && profile && !canUpdate) {
      router.replace(`/employees/${id}`);
    }
  }, [loading, profile, canUpdate, router, id]);

  async function handleSubmit(values: EmployeeInput) {
    await updateEmployee(id, values);
  }

  if (loading || !profile || !canUpdate || staff === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (staff === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/employees" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/employees/${id}`} className="text-sm text-brand hover:underline">
        &larr; {tCommon("back")}
      </Link>
      <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <EmployeeForm
          key={staff.id}
          mode="edit"
          companies={companies}
          administrations={administrations}
          departments={departments}
          roles={roles}
          initialValues={{
            nameAr: staff.nameAr,
            nameEn: staff.nameEn,
            username: staff.username,
            number: staff.number,
            phone: staff.phone,
            jobTitle: staff.jobTitle,
            companyId: staff.companyId,
            administrationId: staff.administrationId,
            departmentId: staff.departmentId,
            roleIds: staff.roleIds,
          }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
