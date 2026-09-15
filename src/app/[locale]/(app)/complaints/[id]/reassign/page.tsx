"use client";

import { use, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { reassignComplaint, subscribeToComplaint } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Complaint, type StaffUser } from "@/lib/types";
import SearchableSelect from "@/components/SearchableSelect";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
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

  const [complaint, setComplaint] = useState<Complaint | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const canReassign = hasPermission(profile, "complaints", "reassign");

  useEffect(
    () => subscribeToComplaint(id, setComplaint, () => setComplaint(null)),
    [id]
  );
  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (complaint) Promise.resolve().then(() => setAssignTo(complaint.assignedTo ?? ""));
  }, [complaint]);

  useEffect(() => {
    if (!loading && profile && !canReassign) {
      router.replace(`/complaints/${id}`);
    }
  }, [loading, profile, canReassign, router, id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError(t("reasonRequired"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await reassignComplaint(
        id,
        assignTo || null,
        complaint?.assignedTo ?? null,
        user?.uid ?? null,
        reason.trim(),
        attachmentUrl
      );
      router.push(`/complaints/${id}`);
    } catch {
      setError(tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

  async function uploadAttachment(file: File) {
    setAttachmentError(null);
    setAttachmentUploading(true);
    try {
      const path = `complaints/${Date.now()}-${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const url = await getDownloadURL(fileRef);
      setAttachmentUrl(url);
    } catch {
      setAttachmentError(tDetail("attachmentUploadFailed"));
    } finally {
      setAttachmentUploading(false);
    }
  }

  function handleAttachmentInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadAttachment(file);
  }

  function handleAttachmentDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadAttachment(file);
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
      <Link href={`/complaints/${id}`} className="text-sm text-brand hover:underline">
        &larr; {tCommon("back")}
      </Link>
      <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-lg border border-border bg-surface p-6">
        <div>
          <label htmlFor="assignTo" className="block text-sm font-medium text-foreground">
            {t("assignToLabel")}
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
            {t("reasonLabel")}
          </label>
          <textarea
            id="reason"
            required
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-foreground">{t("attachment")}</span>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleAttachmentDrop}
            className={`mt-1 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
              dragOver ? "border-brand bg-brand/5" : "border-border"
            }`}
          >
            {attachmentUrl ? (
              <>
                <a
                  href={attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  {tDetail("viewAttachment")}
                </a>
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={attachmentUploading}
                  className="text-xs text-foreground/60 hover:text-foreground disabled:opacity-50"
                >
                  {attachmentUploading ? tCommon("saving") : t("replaceAttachment")}
                </button>
              </>
            ) : (
              <>
                <p className="text-foreground/60">{t("attachmentDropHint")}</p>
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={attachmentUploading}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-black/5 disabled:opacity-50"
                >
                  {attachmentUploading ? tCommon("saving") : t("chooseFile")}
                </button>
              </>
            )}
            <input ref={attachmentInputRef} type="file" onChange={handleAttachmentInputChange} className="hidden" />
          </div>
          {attachmentError && <p className="mt-1 text-xs text-red-600">{attachmentError}</p>}
        </div>

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
            {submitting ? t("submitting") : t("submit")}
          </button>
          <Link href={`/complaints/${id}`} className="text-sm text-foreground/60 hover:text-foreground">
            {tCommon("cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
