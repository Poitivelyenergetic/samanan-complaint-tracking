"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { emptyRolePermissions, type RoleInput, type RolePermissions } from "@/lib/types";
import RolePermissionsEditor from "./RolePermissionsEditor";
import { RolesApiError } from "@/lib/roles-api";

interface RoleFormProps {
  initialValues?: { name: string; permissions: RolePermissions };
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: RoleInput) => Promise<void>;
}

export default function RoleForm({ initialValues, submitLabel, submittingLabel, onSubmit }: RoleFormProps) {
  const t = useTranslations("roles.fields");
  const tErrors = useTranslations("roles.errors");

  const [name, setName] = useState(initialValues?.name ?? "");
  const [permissions, setPermissions] = useState<RolePermissions>(
    initialValues?.permissions ?? emptyRolePermissions()
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), permissions });
    } catch (err) {
      const code = err instanceof RolesApiError ? err.code : "request_failed";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("request_failed"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          {t("name")}
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <RolePermissionsEditor value={permissions} onChange={setPermissions} />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
