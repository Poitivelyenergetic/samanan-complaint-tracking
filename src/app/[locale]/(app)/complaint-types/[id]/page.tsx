"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { getComplaintType, updateComplaintType, deleteComplaintType } from "@/lib/complaintTypes";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type ComplaintType, type ComplaintTypeInput } from "@/lib/types";
import ComplaintTypeForm from "@/components/ComplaintTypeForm";

export default function EditComplaintTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("complaintTypes.edit");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canUpdate = hasPermission(profile, "complaintTypes", "update");
  const canDelete = hasPermission(profile, "complaintTypes", "delete");

  const [type, setType] = useState<ComplaintType | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getComplaintType(id).then(setType);
  }, [id]);

  async function handleSubmit(values: ComplaintTypeInput) {
    await updateComplaintType(id, values);
  }

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    await deleteComplaintType(id);
    router.push("/complaint-types");
  }

  if (loading || !profile || !canUpdate || type === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (type === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/complaint-types" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/complaint-types" className="text-sm text-brand hover:underline">
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
        <ComplaintTypeForm
          key={type.id}
          initialValues={{ name: type.name }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
