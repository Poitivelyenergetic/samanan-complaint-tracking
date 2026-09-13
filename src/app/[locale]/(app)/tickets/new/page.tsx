"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createTicket, TICKET_ADMINISTRATION_ID } from "@/lib/tickets";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToDepartments } from "@/lib/departments";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToTicketTypes } from "@/lib/ticketTypes";
import { subscribeToTicketSources } from "@/lib/ticketSources";
import { useAuth } from "@/lib/auth-context";
import {
  localizedName,
  type Administration,
  type Department,
  type StaffUser,
  type TicketInput,
  type TicketSource,
  type TicketType,
} from "@/lib/types";
import TicketForm from "@/components/TicketForm";

export default function NewTicketPage() {
  const t = useTranslations("ticket.new");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [ticketSources, setTicketSources] = useState<TicketSource[]>([]);

  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToTicketTypes(setTicketTypes), []);
  useEffect(() => subscribeToTicketSources(setTicketSources), []);

  const administration = administrations.find((a) => a.id === TICKET_ADMINISTRATION_ID);
  const administrationLabel = administration ? localizedName(administration, locale) : "";
  const requesterName = profile ? localizedName(profile, locale) || profile.username : "";

  async function handleSubmit(values: TicketInput) {
    await createTicket({ ...values, createdBy: user?.uid ?? null });
    router.back();
  }

  // Filing a ticket is open to every signed-in employee — no permission
  // check beyond being signed in at all.
  if (loading || !profile) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>

      <div className="mt-6">
        <TicketForm
          staff={staff}
          departments={departments}
          administrationId={TICKET_ADMINISTRATION_ID}
          administrationLabel={administrationLabel}
          requesterName={requesterName}
          ticketTypes={ticketTypes}
          ticketSources={ticketSources}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
          hideStatus
        />
      </div>
    </div>
  );
}
