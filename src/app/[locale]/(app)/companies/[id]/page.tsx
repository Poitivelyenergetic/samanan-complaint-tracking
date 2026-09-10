"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteCompany, subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Administration, type Company, type StaffUser } from "@/lib/types";

export default function ViewCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("companies");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canView = hasPermission(profile, "companies", "view");
  const canUpdate = hasPermission(profile, "companies", "update");
  const canDelete = hasPermission(profile, "companies", "delete");

  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (!loading && profile && !canView) {
      router.replace("/companies");
    }
  }, [loading, profile, canView, router]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const company = companies?.find((c) => c.id === id) ?? (companies ? null : undefined);
  const childAdministrations = useMemo(
    () => administrations.filter((a) => a.companyId === id),
    [administrations, id]
  );

  async function handleDelete() {
    if (childAdministrations.length > 0) {
      window.alert(t("deleteBlocked"));
      return;
    }
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteCompany(id);
    router.push("/companies");
  }

  if (loading || !profile || !canView || company === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (company === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/companies" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  const manager = company.managerId ? staffById.get(company.managerId) : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/companies" className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{localizedName(company, locale) || company.number}</h1>
          <p className="mt-0.5 font-mono text-xs text-foreground/50">#{company.number}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canUpdate && (
            <Link
              href={`/companies/${id}/edit`}
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
            <dd className="mt-0.5 text-sm text-foreground">{company.nameAr || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{t("fields.nameEn")}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{company.nameEn || "—"}</dd>
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
        <h2 className="text-sm font-semibold text-foreground">{tNav("administrations")}</h2>
        {childAdministrations.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/50">{t("noAdministrations")}</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {childAdministrations.map((administration) => (
              <li key={administration.id}>
                <Link
                  href={`/administrations/${administration.id}`}
                  className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-black/[0.03] hover:text-brand"
                >
                  {localizedName(administration, locale)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
