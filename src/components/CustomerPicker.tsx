"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createCustomer } from "@/lib/customers";
import { localizedName, type Customer, type StaffUser } from "@/lib/types";

interface CustomerPickerProps {
  customers: Customer[];
  staff: StaffUser[];
  value: string | null;
  onChange: (customerId: string | null) => void;
  disabled?: boolean;
}

export default function CustomerPicker({ customers, staff, value, onChange, disabled = false }: CustomerPickerProps) {
  const t = useTranslations("complaint.customerPicker");
  const locale = useLocale();

  const [search, setSearch] = useState("");
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreate, setQuickCreate] = useState({ number: "", nameAr: "", nameEn: "", phone: "", employeeId: "" });
  const [creating, setCreating] = useState(false);

  const selected = value ? customers.find((c) => c.id === value) ?? null : null;

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return customers
      .filter((c) => c.nameAr.toLowerCase().includes(term) || c.nameEn.toLowerCase().includes(term) || c.number.toLowerCase().includes(term))
      .slice(0, 8);
  }, [customers, search]);

  async function handleQuickCreate() {
    setCreating(true);
    try {
      const id = await createCustomer({
        number: quickCreate.number.trim(),
        nameAr: quickCreate.nameAr.trim(),
        nameEn: quickCreate.nameEn.trim(),
        phone: quickCreate.phone.trim(),
        employeeId: quickCreate.employeeId || null,
      });
      onChange(id);
      setShowQuickCreate(false);
      setQuickCreate({ number: "", nameAr: "", nameEn: "", phone: "", employeeId: "" });
    } finally {
      setCreating(false);
    }
  }

  if (selected) {
    return (
      <div className="mt-1 flex items-center justify-between rounded-md border border-border bg-black/[0.02] px-3 py-2 text-sm">
        <span>
          <span className="font-medium text-foreground">{localizedName(selected, locale)}</span>
          <span className="ms-2 text-foreground/50">{selected.number}</span>
        </span>
        {!disabled && (
          <button type="button" onClick={() => onChange(null)} className="text-brand hover:underline">
            {t("change")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          disabled={disabled}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
        />
        {search.trim() && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface shadow-sm">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-foreground/50">{t("noResults")}</p>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setSearch("");
                  }}
                  className="block w-full px-3 py-2 text-start text-sm hover:bg-black/5"
                >
                  <span className="font-medium text-foreground">{localizedName(c, locale)}</span>
                  <span className="ms-2 text-foreground/50">{c.number}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {!disabled && !showQuickCreate && (
        <button type="button" onClick={() => setShowQuickCreate(true)} className="text-sm text-brand hover:underline">
          {t("newUser")}
        </button>
      )}

      {showQuickCreate && (
        <div className="space-y-3 rounded-md border border-border bg-black/[0.02] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={quickCreate.nameAr}
              onChange={(e) => setQuickCreate((prev) => ({ ...prev, nameAr: e.target.value }))}
              placeholder={t("quickCreate.nameAr")}
              dir="rtl"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <input
              value={quickCreate.nameEn}
              onChange={(e) => setQuickCreate((prev) => ({ ...prev, nameEn: e.target.value }))}
              placeholder={t("quickCreate.nameEn")}
              dir="ltr"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <input
              value={quickCreate.number}
              onChange={(e) => setQuickCreate((prev) => ({ ...prev, number: e.target.value }))}
              placeholder={t("quickCreate.number")}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <input
              value={quickCreate.phone}
              onChange={(e) => setQuickCreate((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder={t("quickCreate.phone")}
              dir="ltr"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
          <select
            value={quickCreate.employeeId}
            onChange={(e) => setQuickCreate((prev) => ({ ...prev, employeeId: e.target.value }))}
            className="w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="">{t("quickCreate.employeeNotAssigned")}</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {localizedName(member, locale)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleQuickCreate}
              disabled={creating || !quickCreate.number.trim() || (!quickCreate.nameAr.trim() && !quickCreate.nameEn.trim())}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
            >
              {t("quickCreate.submit")}
            </button>
            <button
              type="button"
              onClick={() => setShowQuickCreate(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/70 hover:bg-black/5"
            >
              {t("quickCreate.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
