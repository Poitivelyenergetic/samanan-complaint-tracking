"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getCustomer, updateCustomer } from "@/lib/customers";
import { subscribeToStaff, getStaffMember } from "@/lib/users";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToDepartments } from "@/lib/departments";
import { subscribeToRoles } from "@/lib/roles";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  type Administration,
  type Company,
  type Customer,
  type CustomerInput,
  type Department,
  type Role,
  type StaffUser,
} from "@/lib/types";
import UserForm from "@/components/UserForm";

export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("users.edit");
  const tCommon = useTranslations("common");
  const { profile, loading } = useAuth();
  const canUpdate = hasPermission(profile, "customers", "update");

  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [employee, setEmployee] = useState<StaffUser | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    getCustomer(id).then(setCustomer);
  }, [id]);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToRoles(setRoles), []);

  useEffect(() => {
    if (customer === undefined) return;
    Promise.resolve(customer?.employeeId ? getStaffMember(customer.employeeId) : null).then(setEmployee);
  }, [customer]);

  async function handleSubmit(values: CustomerInput) {
    await updateCustomer(id, values);
  }

  if (loading || !profile || !canUpdate || customer === undefined || employee === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (customer === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/users" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/users" className="text-sm text-brand hover:underline">
        &larr; {tCommon("back")}
      </Link>
      <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <UserForm
          key={customer.id}
          staff={staff}
          companies={companies}
          administrations={administrations}
          departments={departments}
          roles={roles}
          initialValues={customer}
          initialEmployee={employee}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
