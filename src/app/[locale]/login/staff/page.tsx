"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { browserLocalPersistence, browserSessionPersistence, setPersistence } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { Link, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LoginCharacters from "@/components/LoginCharacters";
import SamnanPumpSpinner from "@/components/SamnanPumpSpinner";
import { IconEye, IconEyeOff } from "@/components/icons";
import { localizedName } from "@/lib/types";

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
    src: "/subsidiary-logos/samnan-water-solutions.webp",
    alt: "Samnan Water Solutions",
    href: "https://samnanstore.com/",
  },
  {
    src: "/subsidiary-logos/samnan-tech.webp",
    alt: "Samnan Technology Solutions",
    href: "https://samnan.com.sa/en/Company/com11",
  },
];

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
  const locale = useLocale();
  const isRtl = locale === "ar";
  const { user, profile, loading, signIn } = useAuth();
  const welcomeName = profile ? localizedName(profile, locale) || profile.username : "";
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginFailedSignal, setLoginFailedSignal] = useState(0);
  // The reveal is three beats, not one:
  //   1. the form's own content clears out — an empty white panel, not a
  //      shrinking one with text still on it.
  //   2. purple reaches out and grabs the (still-resting) divider — his arm
  //      extends from his own shoulder, not from the divider itself, so
  //      it stays visually attached to his body instead of the moving edge.
  //   3. only once he's actually holding it does the pull happen: the
  //      illustration grows to fill the whole screen.
  // All three happen before the actual route change, so the sequence is
  // visible rather than skipped by it.
  const [formCleared, setFormCleared] = useState(false);
  const [reaching, setReaching] = useState(false);
  const [revealing, setRevealing] = useState(false);
  // Beat 4: once the pull has actually finished covering the screen, hold
  // on a personalized greeting for a moment before navigating — the payoff
  // the pull was building to, not something the route change cuts off.
  const [welcomeShown, setWelcomeShown] = useState(false);

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
      // Beat 1: the form's own content fades out, leaving a blank white
      // panel rather than shrinking a panel that still has text on it.
      setFormCleared(true);
      setTimeout(() => {
        // Beat 2: purple reaches out and grabs the divider.
        setReaching(true);
        setTimeout(() => {
          // Beat 3: now that he's holding it, the actual pull happens.
          setRevealing(true);
          // Matches the pull's own transition duration below — waits for it
          // to actually finish covering the screen before showing beat 4.
          setTimeout(() => {
            setWelcomeShown(true);
            setTimeout(() => router.replace("/home"), 800);
          }, 1500);
        }, 550);
      }, 350);
    } catch {
      setError(t("error"));
      setSubmitting(false);
      setLoginFailedSignal((n) => n + 1);
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#f5f6f8]">
      {/* Login form — the overlay. Starts covering its own half of the
          screen and grows over the illustration below it, so the reveal
          reads as the login being pulled/dragged across to cover the
          characters — purple reaches for it first (below), then it grows
          past his grip and covers him too. */}
      <div
        className={`login-pull-form absolute inset-y-0 end-0 z-20 flex flex-col justify-center bg-white px-6 pb-4 pt-20 transition-[width] duration-[1500ms] ease-in-out sm:px-10 md:px-16 md:py-12 lg:px-24 ${
          revealing ? "is-revealing" : ""
        }`}
      >
        <div className="absolute top-6 end-6">
          <LanguageSwitcher onLight />
        </div>

        {/* Fades out on success before the pull starts — a blank panel
            gets covered, not one that still has the form on it. */}
        <div
          className="mx-auto w-full max-w-sm shrink-0 transition-opacity duration-300 ease-out"
          style={{ opacity: formCleared ? 0 : 1 }}
        >
          <div className="mb-8 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/samnan-logo.svg" alt="Samnan" className="h-9 w-auto" />
            <span className="h-7 w-px bg-[#e2e5eb]" />
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

          {/* Samnan Holding Group and its companies. */}
          <div className="mt-8 flex flex-col items-center gap-3 border-t border-[#eef0f4] pt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/samnan-icon.svg" alt="Samnan Holding Group" className="h-10 w-10" />
            {/* All nine on one row — the columns share the form's width and
                each logo shrinks to fit its column on narrow screens. */}
            <div className="grid w-full grid-cols-9 items-center gap-x-2">
              {SUBSIDIARY_LOGOS.map((logo) => (
                <a
                  key={logo.src}
                  href={logo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={logo.alt}
                  className="flex min-w-0 items-center justify-center transition-transform duration-150 ease-out hover:scale-110"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.src} alt={logo.alt} className="h-7 w-full object-contain" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Phones don't get the illustration panel, so a small pump sits in
            whatever room is left under the form instead: up to 112px, less
            on shorter screens, and gone when there's too little (see
            .login-phone-pump) — the form itself never has to scroll. */}
        <div
          className="login-phone-pump mx-auto mt-2 min-h-0 w-full max-w-sm basis-28 transition-opacity duration-300 ease-out md:hidden"
          style={{ opacity: formCleared ? 0 : 1 }}
        >
          <SamnanPumpSpinner className="h-full w-full cursor-grab animate-pump-enter" />
        </div>

        {/* Beat 4's payoff — a personalized greeting once the pull has
            actually finished covering the screen, the way the reference
            interaction holds on "Welcome Back, {name}" before moving on
            rather than cutting straight to the next screen. */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-out"
          style={{ opacity: welcomeShown ? 1 : 0 }}
        >
          <h1 className="text-2xl font-bold text-[#171a21]">{t("welcomeName", { name: welcomeName })}</h1>
        </div>
      </div>

      {/* Illustration — static, always its own half of the screen. The
          login form (above, in z-order) grows over it during the reveal. */}
      <div className="relative hidden h-full items-end justify-end overflow-hidden bg-[#eef1f8] pe-24 md:flex md:w-1/2">
        {/* The drag-to-rotate 360° pump, big in the open space above the
            characters. Sized off the viewport height so it always clears the
            tallest character (purple, up to 440px, stretching when typing). */}
        <SamnanPumpSpinner className="absolute left-1/2 top-[5vh] z-10 h-[36vh] max-h-[400px] w-[48vh] max-w-[90%] -translate-x-1/2 cursor-grab animate-pump-enter" />
        <LoginCharacters
          isTyping={isTyping}
          showPassword={showPassword}
          passwordLength={password.length}
          loginFailedSignal={loginFailedSignal}
          reaching={reaching}
          revealing={revealing}
          isRtl={isRtl}
        />
      </div>
    </div>
  );
}
