"use client";

export const dynamic = "force-dynamic";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createSignupRequest } from "@/lib/signupRequests";
import PublicShell, { BrandHeader } from "@/components/PublicShell";

interface FormValues {
  name: string;
  username: string;
  contact: string;
  position: string;
  administration: string;
  note: string;
}

const DEFAULT_VALUES: FormValues = {
  name: "",
  username: "",
  contact: "",
  position: "",
  administration: "",
  note: "",
};

export default function StaffSignupPage() {
  const t = useTranslations("staffSignup");
  const tCommon = useTranslations("common");

  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!values.name.trim()) next.name = t("errors.required");
    if (!values.username.trim()) next.username = t("errors.required");
    if (!values.contact.trim()) next.contact = t("errors.required");
    if (!values.position.trim()) next.position = t("errors.required");
    if (!values.administration.trim()) next.administration = t("errors.required");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await createSignupRequest({
        name: values.name.trim(),
        username: values.username.trim().toLowerCase(),
        contact: values.contact.trim(),
        position: values.position.trim(),
        administration: values.administration.trim(),
        note: values.note.trim() || null,
      });
      setSubmitted(true);
    } catch {
      setSubmitError(tCommon("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <PublicShell>
        <BrandHeader />
        <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
            ✓
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">{t("success.title")}</h2>
          <p className="mt-1 text-sm text-foreground/60">{t("success.subtitle")}</p>
          <Link href="/login/staff" className="mt-5 inline-block text-sm text-brand hover:underline">
            {tCommon("back")}
          </Link>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <BrandHeader />

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <Link href="/login/staff" className="text-sm text-brand hover:underline">
          &larr; {tCommon("back")}
        </Link>
        <h2 className="mt-2 text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground">
              {t("fields.name")}
            </label>
            <input
              id="name"
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-foreground">
              {t("fields.username")}
            </label>
            <input
              id="username"
              value={values.username}
              onChange={(e) => update("username", e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username}</p>}
          </div>

          <div>
            <label htmlFor="contact" className="block text-sm font-medium text-foreground">
              {t("fields.contact")}
            </label>
            <input
              id="contact"
              value={values.contact}
              onChange={(e) => update("contact", e.target.value)}
              placeholder={t("fields.contactPlaceholder")}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            {errors.contact && <p className="mt-1 text-xs text-red-600">{errors.contact}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="position" className="block text-sm font-medium text-foreground">
                {t("fields.position")}
              </label>
              <input
                id="position"
                value={values.position}
                onChange={(e) => update("position", e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              {errors.position && <p className="mt-1 text-xs text-red-600">{errors.position}</p>}
            </div>

            <div>
              <label htmlFor="administration" className="block text-sm font-medium text-foreground">
                {t("fields.administration")}
              </label>
              <input
                id="administration"
                value={values.administration}
                onChange={(e) => update("administration", e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              {errors.administration && (
                <p className="mt-1 text-xs text-red-600">{errors.administration}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="note" className="block text-sm font-medium text-foreground">
              {t("fields.note")}
            </label>
            <textarea
              id="note"
              rows={3}
              value={values.note}
              onChange={(e) => update("note", e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-red-600">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? tCommon("saving") : t("submit")}
          </button>
        </form>
      </div>
    </PublicShell>
  );
}
