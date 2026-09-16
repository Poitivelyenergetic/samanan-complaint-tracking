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
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const canViewAllComplaints = hasPermission(profile, "complaints", "viewAll");
  const hasReassignPermission = hasPermission(profile, "complaints", "reassign");
  // Without viewAll (a plain Employee, not Call center/Admin/Super Admin),
  // reassign only ever applies to a complaint currently assigned to you —
  // matches the same restriction in firestore.rules' isReassignWrite() check.
  const isAssignee = !!complaint && !!user && complaint.assignedTo === user.uid;
  const canReassign = hasReassignPermission && (canViewAllComplaints || isAssignee);

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
      router.replace(`/complaints/${id}`);
    }
  }, [loading, profile, complaint, canReassign, router, id]);

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
        complaint?.status ?? null,
        user?.uid ?? null,
        reason.trim(),
        attachmentUrls
      );
      router.push(`/complaints/${id}`);
    } catch {
      setError(tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

  async function uploadAttachments(files: FileList | File[]) {
    const fileList = Array.from(files);
    if (!fileList.length) return;
    setAttachmentError(null);
    setAttachmentUploading(true);
    try {
      const urls = await Promise.all(
        fileList.map(async (file) => {
          const path = `complaints/${Date.now()}-${file.name}`;
          const fileRef = ref(storage, path);
          await uploadBytes(fileRef, file, { contentType: file.type });
          return getDownloadURL(fileRef);
        })
      );
      setAttachmentUrls((prev) => [...prev, ...urls]);
    } catch {
      setAttachmentError(tDetail("attachmentUploadFailed"));
    } finally {
      setAttachmentUploading(false);
    }
  }

  function removeAttachment(url: string) {
    setAttachmentUrls((prev) => prev.filter((u) => u !== url));
  }

  function handleAttachmentInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length) uploadAttachments(files);
  }

  function handleAttachmentDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) uploadAttachments(e.dataTransfer.files);
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
            {attachmentUrls.length > 0 ? (
              <>
                <ul className="w-full space-y-1">
                  {attachmentUrls.map((url, i) => (
                    <li key={url} className="flex items-center justify-center gap-2">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand hover:underline"
                      >
                        {attachmentUrls.length > 1 ? `${tDetail("viewAttachment")} ${i + 1}` : tDetail("viewAttachment")}
                      </a>
                      <button
                        type="button"
                        onClick={() => removeAttachment(url)}
                        className="text-xs text-foreground/50 hover:text-red-600"
                      >
                        {t("removeAttachment")}
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={attachmentUploading}
                  className="text-xs text-foreground/60 hover:text-foreground disabled:opacity-50"
                >
                  {attachmentUploading ? tCommon("saving") : t("addMoreFiles")}
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
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              onChange={handleAttachmentInputChange}
              className="hidden"
            />
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
