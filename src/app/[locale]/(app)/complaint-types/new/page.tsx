"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createComplaintType } from "@/lib/complaintTypes";
import type { ComplaintTypeInput } from "@/lib/types";
import ComplaintTypeForm from "@/components/ComplaintTypeForm";

export default function NewComplaintTypePage() {
  const t = useTranslations("complaintTypes.new");
  const tCommon = useTranslations("common");
  const router = useRouter();

  async function handleSubmit(values: ComplaintTypeInput) {
    await createComplaintType(values);
    router.back();
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <ComplaintTypeForm submitLabel={t("submit")} submittingLabel={tCommon("saving")} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
