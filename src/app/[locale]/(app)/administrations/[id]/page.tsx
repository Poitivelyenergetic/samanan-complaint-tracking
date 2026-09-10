"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteAdministration, subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToDepartments } from "@/lib/departments";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Administration,
  type Company,
  type Department,
  type StaffUser,
} from "@/lib/types";

export default function ViewAdministrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("administrations");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canView = hasPermission(profile, "administrations", "view");
  const canUpdate = hasPermission(profile, "administrations", "update");
  const canDelete = hasPermission(profile, "administrations", "delete");

  const [administrations, setAdministrations] = useState<Administration[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (!loading && profile && !canView) {
      router.replace("/administrations");
    }
  }, [loading, profile, canView, router]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const companiesById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const administration = administrations?.find((a) => a.id === id) ?? (administrations ? null : undefined);
  const childDepartments = useMemo(
    () => departments.filter((d) => d.administrationId === id),
    [departments, id]
  );

  async function handleDelete() {
    if (childDepartments.length > 0) {
      window.alert(t("deleteBlocked"));
      return;
    }
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteAdministration(id);
    router.push("/administrations");
  }

  if (loading || !profile || !canView || administration === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (administration === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/administrations" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  const manager = administration.managerId ? staffById.get(administration.managerId) : undefined;
  const company = companiesById.get(administration.companyId);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/administrations" className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{localizedName(administration, locale)}</h1>
          <p className="mt-0.5 font-mono text-xs text-foreground/50">#{administration.number}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canUpdate && (
            <Link
              href={`/administrations/${id}/edit`}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/70 hover:bg-black/5"
            >
              {tCommon("edit")}
            </Link>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              {tCommon("delete")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-foreground/50">{t("fields.nameAr")}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{administration.nameAr || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{t("fields.nameEn")}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{administration.nameEn || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{t("fields.company")}</dt>
            <dd className="mt-0.5 text-sm">
              {company ? (
                <Link href={`/companies/${company.id}`} className="text-brand hover:underline">
                  {localizedName(company, locale)}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{t("fields.manager")}</dt>
            <dd className="mt-0.5 text-sm">
              {manager ? (
                <Link href={`/employees/${manager.id}`} className="text-brand hover:underline">
                  {localizedName(manager, locale)}
                </Link>
              ) : (
                <span className="text-foreground/50">{t("managerNotAssigned")}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">{tNav("departments")}</h2>
        {childDepartments.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/50">{t("noDepartments")}</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {childDepartments.map((department) => (
              <li key={department.id}>
                <Link
                  href={`/departments/${department.id}`}
                  className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-black/[0.03] hover:text-brand"
                >
                  {localizedName(department, locale)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
