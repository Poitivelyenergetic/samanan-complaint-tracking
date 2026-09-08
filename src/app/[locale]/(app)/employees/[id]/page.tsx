"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { subscribeToStaffMember } from "@/lib/users";
import { deleteEmployee, updateEmployee } from "@/lib/employees-api";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToPositions } from "@/lib/positions";
import { useAuth } from "@/lib/auth-context";
import type { Administration, Company, EmployeeInput, Position, StaffUser } from "@/lib/types";
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
  const { user, profile, loading } = useAuth();

  const [staff, setStaff] = useState<StaffUser | null | undefined>(undefined);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => subscribeToStaffMember(id, setStaff), [id]);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToPositions(setPositions), []);

  // Editing an account requires manageEmployees, not just viewEmployees
  // (which is all the parent layout guarantees).
  useEffect(() => {
    if (!loading && profile && !profile.permissions.manageEmployees) {
      router.replace("/companies");
    }
  }, [loading, profile, router]);

  async function handleSubmit(values: EmployeeInput) {
    await updateEmployee(id, values);
  }

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    await deleteEmployee(id);
    router.push("/companies");
  }

  if (loading || !profile || !profile.permissions.manageEmployees || staff === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (staff === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/companies" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  const isSelf = user?.uid === staff.id;
  // Return to this employee's own position screen rather than the top of
  // the hierarchy, since that's almost always where an edit was reached from.
  const backHref =
    staff.companyId && staff.administrationId && staff.positionId
      ? `/companies/${staff.companyId}/${staff.administrationId}/${staff.positionId}`
      : "/companies";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href={backHref} className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || isSelf}
          title={isSelf ? t("cannotDeleteSelf") : undefined}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          {tCommon("delete")}
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <EmployeeForm
          key={staff.id}
          mode="edit"
          companies={companies}
          administrations={administrations}
          positions={positions}
          initialValues={{
            name: staff.name,
            username: staff.username,
            number: staff.number,
            companyId: staff.companyId,
            administrationId: staff.administrationId,
            positionId: staff.positionId,
            role: staff.role,
            permissions: staff.permissions,
          }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
