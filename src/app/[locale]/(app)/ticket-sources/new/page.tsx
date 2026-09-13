"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createTicketSource } from "@/lib/ticketSources";
import type { TicketSourceInput } from "@/lib/types";
import TicketSourceForm from "@/components/TicketSourceForm";

export default function NewTicketSourcePage() {
  const t = useTranslations("ticketSources.new");
  const tCommon = useTranslations("common");
  const router = useRouter();

  async function handleSubmit(values: TicketSourceInput) {
    await createTicketSource(values);
    router.back();
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <TicketSourceForm submitLabel={t("submit")} submittingLabel={tCommon("saving")} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
