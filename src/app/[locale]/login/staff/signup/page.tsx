"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { Link } from "@/i18n/navigation";
import { createSignupRequest } from "@/lib/signupRequests";
import { createPhoneVerifyApp } from "@/lib/firebase";
import { toE164SaudiPhone } from "@/lib/phone";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactKind = "email" | "phone";

function contactKindOf(contact: string): ContactKind {
  return contact.includes("@") ? "email" : "phone";
}

export default function StaffSignupPage() {
  const t = useTranslations("staffSignup");
  const tv = useTranslations("staffSignup.verification");
  const tCommon = useTranslations("common");

  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Contact verification — a one-time code sent to the email/phone the
  // applicant entered, confirmed before the request can be submitted, so an
  // admin reviewing it knows the contact info is actually reachable.
  const [verifiedContact, setVerifiedContact] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Only used for the phone path — a throwaway secondary Firebase app + its
  // own phone-auth session, torn down on success or unmount. Mirrors
  // login/staff/reset-password's approach.
  const phoneAppRef = useRef<FirebaseApp | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
      if (phoneAppRef.current) deleteApp(phoneAppRef.current).catch(() => undefined);
    };
  }, []);

  const contactKind = contactKindOf(values.contact);
  const contactVerified = verifiedContact !== null && verifiedContact === values.contact;

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "contact") {
      // Editing the contact after verifying (or mid-flow) invalidates
      // whatever code was sent for the previous value.
      setCodeSent(false);
      setCode("");
      setVerifyError(null);
    }
  }

  function verifyErrorMessage(code: string): string {
    const key = `errors.${code}`;
    return tv.has(key) ? tv(key) : tv("errors.sendFailed");
  }

  async function handleSendCode() {
    setVerifyError(null);
    if (contactKind === "email" && !EMAIL_RE.test(values.contact.trim())) {
      setVerifyError(verifyErrorMessage("invalid_email"));
      return;
    }
    setSendingCode(true);
    try {
      if (contactKind === "email") {
        const res = await fetch("/api/signup/send-email-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: values.contact.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setVerifyError(verifyErrorMessage(typeof data.error === "string" ? data.error : "sendFailed"));
          return;
        }
      } else {
        const app = createPhoneVerifyApp();
        phoneAppRef.current = app;
        const phoneAuth = getAuth(app);
        const verifier = new RecaptchaVerifier(phoneAuth, "signup-recaptcha-container", { size: "invisible" });
        recaptchaRef.current = verifier;
        confirmationRef.current = await signInWithPhoneNumber(phoneAuth, toE164SaudiPhone(values.contact), verifier);
      }
      setCodeSent(true);
    } catch {
      setVerifyError(verifyErrorMessage("sendFailed"));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyCode() {
    setVerifyError(null);
    setVerifyingCode(true);
    try {
      if (contactKind === "email") {
        const res = await fetch("/api/signup/verify-email-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: values.contact.trim(), code: code.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setVerifyError(verifyErrorMessage(typeof data.error === "string" ? data.error : "sendFailed"));
          return;
        }
      } else {
        if (!confirmationRef.current) throw new Error("missing confirmation");
        await confirmationRef.current.confirm(code.trim());
        if (phoneAppRef.current) {
          await deleteApp(phoneAppRef.current).catch(() => undefined);
          phoneAppRef.current = null;
        }
      }
      setVerifiedContact(values.contact);
    } catch {
      setVerifyError(verifyErrorMessage("invalid_code"));
    } finally {
      setVerifyingCode(false);
    }
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
    if (!contactVerified) {
      setSubmitError(tv("mustVerify"));
      return;
    }

    setSubmitting(true);
    try {
      await createSignupRequest({
        name: values.name.trim(),
        username: values.username.trim().toLowerCase(),
        contact: values.contact.trim(),
        contactVerified: true,
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
            <div className="mt-1 flex gap-2">
              <input
                id="contact"
                value={values.contact}
                onChange={(e) => update("contact", e.target.value)}
                placeholder={t("fields.contactPlaceholder")}
                readOnly={contactVerified}
                dir="ltr"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
              />
              {!contactVerified && (
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || !values.contact.trim()}
                  className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-black/5 disabled:opacity-60"
                >
                  {sendingCode ? tv("sending") : codeSent ? tv("resend") : tv("sendCode")}
                </button>
              )}
            </div>
            {errors.contact && <p className="mt-1 text-xs text-red-600">{errors.contact}</p>}

            {contactVerified ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-green-700">
                <span aria-hidden>✓</span> {tv("verified")}
              </p>
            ) : (
              codeSent && (
                <div className="mt-2 flex items-end gap-2">
                  <div className="flex-1">
                    <label htmlFor="code" className="block text-xs font-medium text-foreground/70">
                      {tv("codeLabel")}
                    </label>
                    <input
                      id="code"
                      dir="ltr"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={verifyingCode || !code.trim()}
                    className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {verifyingCode ? tv("verifying") : tv("verify")}
                  </button>
                </div>
              )
            )}
            {codeSent && !contactVerified && (
              <p className="mt-1 text-xs text-foreground/50">
                {contactKind === "email" ? tv("codeSentEmail") : tv("codeSentPhone")}
              </p>
            )}
            {verifyError && <p className="mt-1 text-xs text-red-600">{verifyError}</p>}
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

      <div id="signup-recaptcha-container" />
    </PublicShell>
  );
}
