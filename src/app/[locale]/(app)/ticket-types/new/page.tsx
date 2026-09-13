"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createTicketType } from "@/lib/ticketTypes";
import type { TicketTypeInput } from "@/lib/types";
import TicketTypeForm from "@/components/TicketTypeForm";

export default function NewTicketTypePage() {
  const t = useTranslations("ticketTypes.new");
  const tCommon = useTranslations("common");
  const router = useRouter();

  async function handleSubmit(values: TicketTypeInput) {
    await createTicketType(values);
    router.back();
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <TicketTypeForm submitLabel={t("submit")} submittingLabel={tCommon("saving")} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
