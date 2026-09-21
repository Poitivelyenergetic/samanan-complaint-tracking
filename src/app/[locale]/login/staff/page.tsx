"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { browserLocalPersistence, browserSessionPersistence, setPersistence } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { Link, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LoginCharacters, { LOGIN_CHARACTER_COLORS } from "@/components/LoginCharacters";
import { IconEye, IconEyeOff } from "@/components/icons";

// The Samnan Holding Group's subsidiary companies, shown above the
// illustration's characters — mirrors the "Our Companies" section on
// samnan.com.sa (full-color logos, each one a real link to that company's
// page there) rather than leaving that space empty.
const SUBSIDIARY_LOGOS = [
  { src: "/subsidiary-logos/rezeq.webp", alt: "Rezeq", href: "https://samnan.com.sa/en/Company/com2" },
  {
    src: "/subsidiary-logos/sanam-aljazeera.png",
    alt: "Sanam Aljazeera",
    href: "https://samnan.com.sa/en/Company/SANAM%20ALJAZEERA%20COMPANY%20FOR%20PROJECTS%20LTD",
  },
  { src: "/subsidiary-logos/samnan-pools.png", alt: "Samnan Pools", href: "https://samnan.com.sa/en/Company/SMP" },
  {
    src: "/subsidiary-logos/samnan-petroleum.webp",
    alt: "Samnan Petroleum Services",
    href: "https://samnan.com.sa/en/Company/Samnan%20petroleum",
  },
  {
    src: "/subsidiary-logos/water-environment.png",
    alt: "Water & Environment Technology",
    href: "https://samnan.com.sa/en/Company/Miyah%20for%20water%20&%20environment%20technology",
  },
  {
    src: "/subsidiary-logos/alhufi-contracting.png",
    alt: "Alhufi Contracting",
    href: "https://samnan.com.sa/en/Company/ALHUFI%20CONTRACTING%20LIMITED",
  },
  {
    src: "/subsidiary-logos/samnan-real-estate.webp",
    alt: "Samnan Real Estate Investment",
    href: "https://samnan.com.sa/en/Company/SAMNAN%20REAL%20ESTATE%20INVESTMENT",
  },
  {
    src: "/subsidiary-logos/samnan-tech.webp",
    alt: "Samnan Technology Solutions",
    href: "https://samnan.com.sa/en/Company/com11",
  },
];

// A simple cartoon hand — three overlapping circles as fingers sitting on a
// rounded-rectangle palm. Anchored to the illustration panel's trailing
// edge as purple's own arm, reaching across to grip the divider — see the
// reveal animation below.
function Hand({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <svg width="70" height="100" viewBox="0 0 90 130" className={flip ? "-scale-x-100" : ""} aria-hidden="true">
      <rect x="10" y="50" width="70" height="80" rx="30" fill={color} />
      <circle cx="25" cy="35" r="16" fill={color} />
      <circle cx="45" cy="25" r="18" fill={color} />
      <circle cx="65" cy="35" r="16" fill={color} />
    </svg>
  );
}

// Pill button whose label slides out to the side on hover while a filled
// version (with an arrow) slides in underneath — same interaction as the
// reference's "InteractiveHoverButton".
function HoverButton({
  children,
  type = "button",
  disabled,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`group relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-full border border-[#e2e5eb] bg-white px-6 text-sm font-semibold text-[#171a21] shadow-sm transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      <span className="inline-block transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">
        {children}
      </span>
      <span className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-full bg-brand text-brand-foreground opacity-0 transition-all duration-300 group-hover:opacity-100">
        {children}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </span>
    </button>
  );
}

export default function StaffLoginPage() {
  const t = useTranslations("login");
  const tCommon = useTranslations("common");
  const { user, loading, signIn } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginFailedSignal, setLoginFailedSignal] = useState(0);
  // On success, purple pulls the divider all the way across — the
  // illustration side grows from half the screen to the whole thing, as if
  // he'd dragged the form panel out of the way — before actually navigating,
  // so the pull is visible rather than skipped by the route change.
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    // Skipped for the whole span of a form-triggered sign-in (submitting
    // stays true from the first line of handleSubmit through to the
    // pull animation's own navigation) — its setTimeout below owns
    // navigation for that flow. Guarding on `revealing` alone isn't enough:
    // the auth context's `user` can flip true (via Firebase's own listener)
    // before this component's setRevealing(true) line even runs, and this
    // effect firing in that gap can't be undone once it does.
    if (!loading && user && !submitting) {
      router.replace("/home");
    }
  }, [loading, user, submitting, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signIn(username, password);
      setRevealing(true);
      // Matches the reveal's own transition duration below — the pull needs
      // to actually finish, not just start, before the route swaps to /home.
      setTimeout(() => router.replace("/home"), 2000);
    } catch {
      setError(t("error"));
      setSubmitting(false);
      setLoginFailedSignal((n) => n + 1);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#f5f6f8]">
      <div className="relative flex h-full w-full">
        <div
          className={`login-pull-illustration relative hidden items-end justify-center overflow-hidden bg-[#eef1f8] transition-[flex-basis] duration-[2000ms] ease-in-out md:flex ${
            revealing ? "is-revealing" : ""
          }`}
        >
          <div className="absolute top-8 start-10 end-10 flex flex-col items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/samnan-icon.svg" alt="Samnan Holding Group" className="h-16 w-16" />
            <div className="grid grid-cols-4 gap-x-6 gap-y-4">
              {SUBSIDIARY_LOGOS.map((logo) => (
                <a
                  key={logo.href}
                  href={logo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center transition-transform duration-150 ease-out hover:scale-110"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.src} alt={logo.alt} className="h-8 w-auto object-contain" />
                </a>
              ))}
            </div>
          </div>
          <LoginCharacters
            isTyping={isTyping}
            showPassword={showPassword}
            passwordLength={password.length}
            loginFailedSignal={loginFailedSignal}
          />
          {/* Purple's arm — invisible at rest. Rather than growing outward
              (which read as pushing, not pulling), it's already at full
              length and just fades in gripping the divider, then rides
              along with it — pinned to the illustration panel's own edge —
              for the whole pull, the same way you'd actually drag something
              by holding on to one spot rather than stretching toward it.
              The sleeve and hand rotate together as one straight piece —
              rotating only the hand at the tip left a visible kink where a
              perfectly horizontal sleeve met an angled hand. */}
          <div
            className="pointer-events-none absolute bottom-72 end-0 z-20 flex items-center -rotate-[8deg] transition-opacity duration-500 ease-out"
            style={{ opacity: revealing ? 1 : 0, transformOrigin: "100% 50%" }}
          >
            <div className="h-10 w-[380px] shrink-0 rounded-full" style={{ backgroundColor: LOGIN_CHARACTER_COLORS.purple }} />
            <div className="-ms-6 shrink-0">
              <Hand color={LOGIN_CHARACTER_COLORS.purple} />
            </div>
          </div>
        </div>

        <div
          className={`login-pull-form relative flex min-w-0 basis-full flex-col justify-center bg-white px-6 py-12 transition-[flex-basis,opacity] duration-[2000ms] ease-in-out sm:px-10 md:px-16 lg:px-24 ${
            revealing ? "is-revealing" : ""
          }`}
        >
          <div className="absolute top-6 end-6">
            <LanguageSwitcher />
          </div>

          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/samnan-icon.svg" alt={tCommon("appName")} className="h-8 w-8" />
              <span className="text-sm font-semibold text-[#171a21]">{tCommon("appName")}</span>
            </div>

            <h1 className="text-2xl font-bold text-[#171a21]">{t("welcomeBack")}</h1>
            <p className="mt-1 text-sm text-[#6b7280]">{t("enterDetails")}</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-[#171a21]">
                  {t("username")}
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  className="mt-1 w-full rounded-full border border-[#e2e5eb] bg-white px-4 py-2.5 text-sm text-[#171a21] outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[#171a21]">
                  {t("password")}
                </label>
                <div className="relative mt-1">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-full border border-[#e2e5eb] bg-white px-4 py-2.5 pe-10 text-sm text-[#171a21] outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-[#374151]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-[#d1d5db] text-brand focus:ring-brand"
                  />
                  {t("rememberMe")}
                </label>
                <Link href="/login/staff/reset-password" className="font-medium text-brand hover:underline">
                  {t("forgotPassword")}
                </Link>
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <HoverButton type="submit" disabled={submitting}>
                {submitting ? t("signingIn") : t("submit")}
              </HoverButton>
            </form>

            <p className="mt-6 text-center text-sm text-[#6b7280]">
              {t("noAccount")}{" "}
              <Link href="/login/staff/signup" className="font-medium text-brand hover:underline">
                {t("signUp")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
