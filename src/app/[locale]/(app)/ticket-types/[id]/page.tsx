"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { getTicketType, updateTicketType, deleteTicketType } from "@/lib/ticketTypes";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type TicketType, type TicketTypeInput } from "@/lib/types";
import TicketTypeForm from "@/components/TicketTypeForm";
import Spinner from "@/components/Spinner";

export default function EditTicketTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("ticketTypes.edit");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canUpdate = hasPermission(profile, "ticketTypes", "update");
  const canDelete = hasPermission(profile, "ticketTypes", "delete");

  const [type, setType] = useState<TicketType | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getTicketType(id).then(setType);
  }, [id]);

  async function handleSubmit(values: TicketTypeInput) {
    await updateTicketType(id, values);
  }

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    await deleteTicketType(id);
    router.push("/ticket-types");
  }

  if (loading || !profile || !canUpdate || type === undefined) {
    return <Spinner />;
  }

  if (type === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/ticket-types" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/ticket-types" className="text-sm text-brand hover:underline">
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
        <TicketTypeForm
          key={type.id}
          initialValues={{ nameAr: type.nameAr, nameEn: type.nameEn }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
