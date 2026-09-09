"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { Link, useRouter } from "@/i18n/navigation";
import { createPhoneVerifyApp } from "@/lib/firebase";
import { toE164SaudiPhone } from "@/lib/phone";
import PublicShell, { BrandHeader } from "@/components/PublicShell";

type Step = "request" | "verify" | "newPassword" | "done";

export default function ResetPasswordPage() {
  const t = useTranslations("login.reset");
  const tLogin = useTranslations("login");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [step, setStep] = useState<Step>("request");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A throwaway secondary Firebase app + its own phone-auth session, torn
  // down on success, cancel, or unmount — see createPhoneVerifyApp().
  const appRef = useRef<FirebaseApp | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
      if (appRef.current) deleteApp(appRef.current).catch(() => undefined);
    };
  }, []);

  function errorMessage(code: string): string {
    const key = `errors.${code}`;
    return t.has(key) ? t(key) : t("errors.request_failed");
  }

  async function handleRequestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const app = createPhoneVerifyApp();
      appRef.current = app;
      const phoneAuth = getAuth(app);
      const verifier = new RecaptchaVerifier(phoneAuth, "recaptcha-container", { size: "invisible" });
      recaptchaRef.current = verifier;
      confirmationRef.current = await signInWithPhoneNumber(phoneAuth, toE164SaudiPhone(phone), verifier);
      setStep("verify");
    } catch {
      setError(t("errors.sendFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!confirmationRef.current) throw new Error("missing confirmation");
      await confirmationRef.current.confirm(code);
      setStep("newPassword");
    } catch {
      setError(t("errors.invalidCode"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const app = appRef.current;
      const idToken = app ? await getAuth(app).currentUser?.getIdToken() : undefined;
      if (!idToken) throw new Error("missing phone verification");

      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), phoneIdToken: idToken, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorMessage(typeof data.error === "string" ? data.error : "request_failed"));
        setSubmitting(false);
        return;
      }
      if (appRef.current) {
        await deleteApp(appRef.current).catch(() => undefined);
        appRef.current = null;
      }
      setStep("done");
    } catch {
      setError(t("errors.request_failed"));
      setSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <BrandHeader subtitle={tCommon("appSubtitle")} />

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>

        {step === "request" && (
          <>
            <p className="mt-1 text-sm text-foreground/60">{t("requestSubtitle")}</p>
            <form onSubmit={handleRequestCode} className="mt-6 space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-foreground">
                  {tLogin("username")}
                </label>
                <input
                  id="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-foreground">
                  {t("phone")}
                </label>
                <input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  required
                  placeholder="05XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
                <p className="mt-1 text-xs text-foreground/50">{t("phoneHint")}</p>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? t("sending") : t("sendCode")}
              </button>
            </form>
          </>
        )}

        {step === "verify" && (
          <>
            <p className="mt-1 text-sm text-foreground/60">{t("verifySubtitle")}</p>
            <form onSubmit={handleVerifyCode} className="mt-6 space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-foreground">
                  {t("code")}
                </label>
                <input
                  id="code"
                  dir="ltr"
                  required
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? t("verifying") : t("verifyCode")}
              </button>
            </form>
          </>
        )}

        {step === "newPassword" && (
          <>
            <p className="mt-1 text-sm text-foreground/60">{t("newPasswordSubtitle")}</p>
            <form onSubmit={handleSetPassword} className="mt-6 space-y-4">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-foreground">
                  {t("newPassword")}
                </label>
                <input
                  id="newPassword"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? tCommon("saving") : t("setPassword")}
              </button>
            </form>
          </>
        )}

        {step === "done" && (
          <>
            <p className="mt-3 text-sm text-foreground/70">{t("doneMessage")}</p>
            <button
              type="button"
              onClick={() => router.replace("/login/staff")}
              className="mt-5 w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
            >
              {t("backToLogin")}
            </button>
          </>
        )}

        {step !== "done" && (
          <p className="mt-4 text-center text-sm text-foreground/60">
            <Link href="/login/staff" className="text-brand hover:underline">
              {tCommon("cancel")}
            </Link>
          </p>
        )}
      </div>

      <div id="recaptcha-container" />
    </PublicShell>
  );
}
