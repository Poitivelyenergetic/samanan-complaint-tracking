"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createEmployee } from "@/lib/employees-api";
import type { EmployeeInput } from "@/lib/types";
import EmployeeForm from "@/components/EmployeeForm";

export default function NewEmployeePage() {
  const t = useTranslations("employees.new");
  const tCommon = useTranslations("common");
  const router = useRouter();

  async function handleSubmit(values: EmployeeInput) {
    const { id } = await createEmployee({ ...values, password: values.password ?? "" });
    router.push(`/employees/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <EmployeeForm
          mode="create"
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
