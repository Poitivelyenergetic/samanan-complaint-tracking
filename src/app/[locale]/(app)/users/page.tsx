"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToCustomers, deleteCustomer } from "@/lib/customers";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Customer, type StaffUser } from "@/lib/types";

export default function UsersPage() {
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { profile } = useAuth();
  const canCreate = hasPermission(profile, "customers", "create");
  const canUpdate = hasPermission(profile, "customers", "update");
  const canDelete = hasPermission(profile, "customers", "delete");

  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => subscribeToCustomers(setCustomers), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        c.nameAr.toLowerCase().includes(term) ||
        c.nameEn.toLowerCase().includes(term) ||
        c.number.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term)
    );
  }, [customers, search]);

  async function handleDelete(customer: Customer) {
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteCustomer(customer.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        {canCreate && (
          <Link
            href="/users/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("newButton")}
          </Link>
        )}
      </div>

      <div className="mt-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          type="search"
          className="w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[640px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.number")}</th>
              <th className="px-4 py-3 text-start">{t("table.nameAr")}</th>
              <th className="px-4 py-3 text-start">{t("table.nameEn")}</th>
              <th className="px-4 py-3 text-start">{t("table.phone")}</th>
              <th className="px-4 py-3 text-start">{t("table.assignedEmployee")}</th>
              {canDelete && <th className="px-4 py-3 text-start">{tCommon("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {customers === null ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              filtered.map((customer) => (
                <tr key={customer.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    {canUpdate ? (
                      <Link href={`/users/${customer.id}`} className="font-medium text-foreground hover:text-brand">
                        {customer.number}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{customer.number}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{customer.nameAr || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">{customer.nameEn || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70" dir="ltr">
                    {customer.phone || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {customer.employeeId
                      ? localizedName(staffById.get(customer.employeeId), locale) || "—"
                      : t("employeeNotAssigned")}
                  </td>
                  {canDelete && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(customer)}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        {tCommon("delete")}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
