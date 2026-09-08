"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { getRole } from "@/lib/roles";
import { deleteRole, updateRole } from "@/lib/roles-api";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type Role, type RoleInput } from "@/lib/types";
import RoleForm from "@/components/RoleForm";

export default function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("roles.edit");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canUpdate = hasPermission(profile, "roles", "update");
  const canDelete = hasPermission(profile, "roles", "delete");

  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getRole(id).then(setRole);
  }, [id]);

  async function handleSubmit(values: RoleInput) {
    await updateRole(id, values);
  }

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    await deleteRole(id);
    router.push("/roles");
  }

  if (loading || !profile || !canUpdate || role === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (role === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/roles" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/roles" className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            {tCommon("delete")}
          </button>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <RoleForm
          key={role.id}
          initialValues={{ name: role.name, permissions: role.permissions }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
