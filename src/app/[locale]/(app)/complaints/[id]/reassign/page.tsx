"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { reassignComplaint, subscribeToComplaint } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Complaint, type StaffUser } from "@/lib/types";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";
import SearchableSelect from "@/components/SearchableSelect";
import AttachmentUploader from "@/components/AttachmentUploader";
import Spinner from "@/components/Spinner";

export default function ReassignComplaintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("complaint.reassign");
  const tDetail = useTranslations("complaint.detail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { profile, user, loading } = useAuth();
  // Came from the view-only complaint page (see its viewOnly) — go back to that.
  const viewOnly = useSearchParams().get("view") === "1";
  const complaintHref = `/complaints/${id}${viewOnly ? "?view=1" : ""}`;
  const back = () => (viewOnly ? router.replace(complaintHref) : router.back());

  const [complaint, setComplaint] = useState<Complaint | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachments = useAttachmentUpload({
    storagePathPrefix: "complaints",
    errorMessage: tDetail("attachmentUploadFailed"),
  });

  const canViewAllComplaints = hasPermission(profile, "complaints", "viewAll");
  const hasReassignPermission = hasPermission(profile, "complaints", "reassign");
  // Without viewAll (a plain Employee, not Call center/Admin/Super Admin),
  // reassign only ever applies to a complaint currently assigned to you —
  // matches the same restriction in firestore.rules' isReassignWrite() check.
  const isAssignee = !!complaint && !!user && complaint.assignedTo === user.uid;
  const canReassign = hasReassignPermission && (canViewAllComplaints || isAssignee);
  // Nobody has it yet: assigning it, not reassigning.
  const assigning = !!complaint && !complaint.assignedTo;

  useEffect(
    () => subscribeToComplaint(id, setComplaint, () => setComplaint(null)),
    [id]
  );
  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (complaint) Promise.resolve().then(() => setAssignTo(complaint.assignedTo ?? ""));
  }, [complaint]);

  useEffect(() => {
    if (!loading && profile && complaint !== undefined && !canReassign) {
      router.replace(complaintHref);
    }
  }, [loading, profile, complaint, canReassign, router, complaintHref]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError(assigning ? t("assignReasonRequired") : t("reasonRequired"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await reassignComplaint(
        id,
        assignTo || null,
        complaint?.assignedTo ?? null,
        complaint?.status ?? null,
        user?.uid ?? null,
        reason.trim(),
        attachments.urls
      );
      // From the view-only tab: replace, so its Back still goes to the list.
      if (viewOnly) router.replace(complaintHref);
      else router.push(complaintHref);
    } catch {
      setError(tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

  if (complaint === undefined || loading || !profile || !canReassign) {
    return <Spinner />;
  }

  if (complaint === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{tDetail("notFound")}</p>
        <Link href="/dashboard" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button type="button" onClick={back} className="text-sm text-brand hover:underline">
        &larr; {tCommon("back")}
      </button>
      <h1 className="mt-1 text-xl font-bold text-foreground">{assigning ? t("assignTitle") : t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{assigning ? t("assignSubtitle") : t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-lg border border-border bg-surface p-6">
        <div>
          <label htmlFor="assignTo" className="block text-sm font-medium text-foreground">
            {assigning ? t("assignAssignTo") : t("assignToLabel")}
          </label>
          <div className="mt-1 max-w-xs">
            <SearchableSelect
              id="assignTo"
              items={staff}
              value={assignTo}
              onChange={setAssignTo}
              getId={(member) => member.id}
              getLabel={(member) => localizedName(member, locale)}
              placeholder={tCommon("unassigned")}
            />
          </div>
        </div>

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-foreground">
            {assigning ? t("assignReasonLabel") : t("reasonLabel")}
          </label>
          <textarea
            id="reason"
            required
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={assigning ? t("assignReasonPlaceholder") : t("reasonPlaceholder")}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        <AttachmentUploader
          label={t("attachment")}
          urls={attachments.urls}
          uploading={attachments.uploading}
          error={attachments.error}
          dragOver={attachments.dragOver}
          inputRef={attachments.inputRef}
          onDragOver={attachments.handleDragOver}
          onDragLeave={attachments.handleDragLeave}
          onDrop={attachments.handleDrop}
          onInputChange={attachments.handleInputChange}
          onOpenPicker={attachments.openFilePicker}
          onRemove={attachments.remove}
          viewAttachmentLabel={tDetail("viewAttachment")}
          removeLabel={t("removeAttachment")}
          addMoreLabel={t("addMoreFiles")}
          chooseFileLabel={t("chooseFile")}
          dropHintLabel={t("attachmentDropHint")}
          savingLabel={tCommon("saving")}
        />

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? (assigning ? t("assignSubmitting") : t("submitting")) : assigning ? t("assignSubmit") : t("submit")}
          </button>
          <button type="button" onClick={back} className="text-sm text-foreground/60 hover:text-foreground">
            {tCommon("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
