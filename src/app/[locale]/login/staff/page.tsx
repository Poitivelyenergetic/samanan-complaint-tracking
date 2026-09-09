"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { Link, useRouter } from "@/i18n/navigation";
import PublicShell, { BrandHeader } from "@/components/PublicShell";

export default function StaffLoginPage() {
  const t = useTranslations("login");
  const tCommon = useTranslations("common");
  const { user, loading, signIn } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(username, password);
      router.replace("/dashboard");
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <BrandHeader subtitle={tCommon("appSubtitle")} />

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-foreground">
              {t("username")}
            </label>
            <input
              id="username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              {t("password")}
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
            {submitting ? t("signingIn") : t("submit")}
          </button>
        </form>

        <p className="mt-3 text-center text-sm">
          <Link href="/login/staff/reset-password" className="text-brand hover:underline">
            {t("forgotPassword")}
          </Link>
        </p>

        <p className="mt-4 text-center text-sm text-foreground/60">
          {t("noAccount")}{" "}
          <Link href="/login/staff/signup" className="text-brand hover:underline">
            {t("signUp")}
          </Link>
        </p>
      </div>

      <p className="mt-4 text-center text-xs text-foreground/50">{t("demoHint")}</p>
    </PublicShell>
  );
}
