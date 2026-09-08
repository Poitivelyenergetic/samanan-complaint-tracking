"use client";

// Uses useSearchParams(), which requires this route to be dynamically
// rendered rather than statically prerendered.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createEmployee } from "@/lib/employees-api";
import { getSignupRequest, markSignupRequestApproved } from "@/lib/signupRequests";
import { useAuth } from "@/lib/auth-context";
import type { EmployeeInput, SignupRequest } from "@/lib/types";
import EmployeeForm from "@/components/EmployeeForm";

export default function NewEmployeePage() {
  const t = useTranslations("employees.new");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromRequestId = searchParams.get("fromRequest");
  const { profile, loading } = useAuth();

  const [request, setRequest] = useState<SignupRequest | null | undefined>(
    fromRequestId ? undefined : null
  );

  useEffect(() => {
    if (!fromRequestId) return;
    getSignupRequest(fromRequestId).then(setRequest);
  }, [fromRequestId]);

  // Creating an account requires manageEmployees, not just viewEmployees
  // (which is all the parent layout guarantees).
  useEffect(() => {
    if (!loading && profile && !profile.permissions.manageEmployees) {
      router.replace("/employees");
    }
  }, [loading, profile, router]);

  async function handleSubmit(values: EmployeeInput) {
    const { id } = await createEmployee({ ...values, password: values.password ?? "" });
    if (fromRequestId) {
      await markSignupRequestApproved(fromRequestId);
    }
    router.push(`/employees/${id}`);
  }

  if (loading || !profile || !profile.permissions.manageEmployees) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (fromRequestId && request === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (fromRequestId && request === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("requestNotFound")}</p>
        <Link href="/employees/requests" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      {request && (
        <p className="mt-1 text-sm text-foreground/60">{t("approvingRequest", { name: request.name })}</p>
      )}

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <EmployeeForm
          mode="create"
          initialValues={
            request
              ? {
                  name: request.name,
                  username: request.username,
                  position: request.position,
                  administration: request.administration,
                }
              : undefined
          }
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
