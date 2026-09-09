"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createCustomer } from "@/lib/customers";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToDepartments } from "@/lib/departments";
import { subscribeToRoles } from "@/lib/roles";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  type Administration,
  type Company,
  type CustomerInput,
  type Department,
  type Role,
  type StaffUser,
} from "@/lib/types";
import UserForm from "@/components/UserForm";

export default function NewUserPage() {
  const t = useTranslations("users.new");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToRoles(setRoles), []);

  async function handleSubmit(values: CustomerInput) {
    const id = await createCustomer(values);
    router.push(`/users/${id}`);
  }

  if (loading || !profile || !hasPermission(profile, "customers", "create")) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <UserForm
          staff={staff}
          companies={companies}
          administrations={administrations}
          departments={departments}
          roles={roles}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
