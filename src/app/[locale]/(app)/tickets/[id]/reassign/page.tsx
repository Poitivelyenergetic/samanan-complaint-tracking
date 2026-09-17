"use client";

import { use, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { reassignTicket, subscribeToTicket, TICKET_ADMINISTRATION_ID } from "@/lib/tickets";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToDepartments } from "@/lib/departments";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Department, type StaffUser, type Ticket } from "@/lib/types";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import SearchableSelect from "@/components/SearchableSelect";
import Spinner from "@/components/Spinner";

export default function ReassignTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("ticket.reassign");
  const tFields = useTranslations("ticket.fields");
  const tDetail = useTranslations("ticket.detail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { profile, user, loading } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const canReassign = hasPermission(profile, "tickets", "reassign");

  useEffect(() => subscribeToTicket(id, setTicket, () => setTicket(null)), [id]);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);

  useEffect(() => {
    if (ticket) {
      Promise.resolve().then(() => {
        setDepartmentId(ticket.departmentId ?? "");
        setAssignTo(ticket.assignedTo ?? "");
      });
    }
  }, [ticket]);

  useEffect(() => {
    if (!loading && profile && !canReassign) {
      router.replace(`/tickets/${id}`);
    }
  }, [loading, profile, canReassign, router, id]);

  const departmentOptions = useMemo(
    () => departments.filter((d) => d.administrationId === TICKET_ADMINISTRATION_ID),
    [departments]
  );
  const employeeOptions = useMemo(() => {
    if (departmentId) return staff.filter((s) => s.departmentId === departmentId);
    return staff.filter((s) => s.administrationId === TICKET_ADMINISTRATION_ID);
  }, [staff, departmentId]);

  function handleDepartmentChange(nextId: string) {
    setDepartmentId(nextId);
    const emp = staff.find((s) => s.id === assignTo);
    if (!nextId || emp?.departmentId !== nextId) setAssignTo("");
  }

  function handleEmployeeChange(nextId: string) {
    setAssignTo(nextId);
    const emp = staff.find((s) => s.id === nextId);
    if (emp && !departmentId) setDepartmentId(emp.departmentId);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError(t("reasonRequired"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await reassignTicket(
        id,
        departmentId || null,
        assignTo || null,
        ticket?.assignedTo ?? null,
        user?.uid ?? null,
        reason.trim(),
        attachmentUrls
      );
      router.push(`/tickets/${id}`);
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
          const path = `tickets/${Date.now()}-${file.name}`;
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

  if (ticket === undefined || loading || !profile || !canReassign) {
    return <Spinner />;
  }

  if (ticket === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{tDetail("notFound")}</p>
        <Link href="/tickets" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm text-brand hover:underline"
      >
        &larr; {tCommon("back")}
      </button>
      <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-lg border border-border bg-surface p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="departmentId" className="block text-sm font-medium text-foreground">
              {tFields("department")}
            </label>
            <div className="mt-1">
              <SearchableSelect
                id="departmentId"
                items={departmentOptions}
                value={departmentId}
                onChange={handleDepartmentChange}
                getId={(d) => d.id}
                getLabel={(d) => localizedName(d, locale)}
                placeholder={tFields("selectDepartment")}
              />
            </div>
          </div>
          <div>
            <label htmlFor="assignTo" className="block text-sm font-medium text-foreground">
              {t("assignToLabel")}
            </label>
            <div className="mt-1">
              <SearchableSelect
                id="assignTo"
                items={employeeOptions}
                value={assignTo}
                onChange={handleEmployeeChange}
                getId={(member) => member.id}
                getLabel={(member) => localizedName(member, locale)}
                placeholder={tCommon("unassigned")}
              />
            </div>
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
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-foreground/60 hover:text-foreground"
          >
            {tCommon("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
