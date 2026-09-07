"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { subscribeToStaffMember } from "@/lib/users";
import { deleteEmployee, updateEmployee } from "@/lib/employees-api";
import { useAuth } from "@/lib/auth-context";
import type { EmployeeInput, StaffUser } from "@/lib/types";
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
  const { user } = useAuth();

  const [staff, setStaff] = useState<StaffUser | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => subscribeToStaffMember(id, setStaff), [id]);

  async function handleSubmit(values: EmployeeInput) {
    await updateEmployee(id, values);
  }

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    await deleteEmployee(id);
    router.push("/employees");
  }

  if (staff === undefined) {
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

  const isSelf = user?.uid === staff.id;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/employees" className="text-sm text-brand hover:underline">
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
          initialValues={{
            name: staff.name,
            username: staff.username,
            number: staff.number,
            position: staff.position,
            administration: staff.administration,
            role: staff.role,
          }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
