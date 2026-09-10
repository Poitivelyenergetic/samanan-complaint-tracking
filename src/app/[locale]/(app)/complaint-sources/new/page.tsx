"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createComplaintSource } from "@/lib/complaintSources";
import type { ComplaintSourceInput } from "@/lib/types";
import ComplaintSourceForm from "@/components/ComplaintSourceForm";

export default function NewComplaintSourcePage() {
  const t = useTranslations("complaintSources.new");
  const tCommon = useTranslations("common");
  const router = useRouter();

  async function handleSubmit(values: ComplaintSourceInput) {
    await createComplaintSource(values);
    router.back();
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <ComplaintSourceForm submitLabel={t("submit")} submittingLabel={tCommon("saving")} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
