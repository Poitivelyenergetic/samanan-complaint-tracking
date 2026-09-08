"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createRole } from "@/lib/roles-api";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type RoleInput } from "@/lib/types";
import RoleForm from "@/components/RoleForm";

export default function NewRolePage() {
  const t = useTranslations("roles.new");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();

  async function handleSubmit(values: RoleInput) {
    const { id } = await createRole(values);
    router.push(`/roles/${id}`);
  }

  if (loading || !profile || !hasPermission(profile, "roles", "create")) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <RoleForm submitLabel={t("submit")} submittingLabel={tCommon("saving")} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
