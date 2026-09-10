"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage, usernameToEmail } from "@/lib/firebase";
import { updateOwnProfile } from "@/lib/users";
import { subscribeToRoles } from "@/lib/roles";
import { useAuth } from "@/lib/auth-context";
import { CRUD_ACTIONS, PERMISSION_RESOURCES, localizedName, type Role } from "@/lib/types";

type Section = "profile" | "password" | "permissions";

const ALL_RESOURCES = [...PERMISSION_RESOURCES, "marketing" as const];
const COMPLAINTS_EXTRA_ACTIONS = ["viewAll", "reassign", "acceptReassignment"] as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]).join("");
  return initials.toUpperCase() || "?";
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export default function AccountSettingsPage() {
  const t = useTranslations("account");
  const tFields = useTranslations("employees.fields");
  const tResources = useTranslations("roles.resources");
  const tActions = useTranslations("roles.actions");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { user, profile } = useAuth();

  const [section, setSection] = useState<Section>("profile");

  const [phone, setPhone] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => subscribeToRoles(setRoles), []);

  useEffect(() => {
    if (profile) Promise.resolve().then(() => setPhone(profile.phone));
  }, [profile]);

  async function handleSavePhone(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setPhoneSaving(true);
    setPhoneSaved(false);
    try {
      await updateOwnProfile(user.uid, { phone });
      setPhoneSaved(true);
    } finally {
      setPhoneSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const avatarRef = ref(storage, `avatars/${user.uid}/avatar`);
      await uploadBytes(avatarRef, file, { contentType: file.type });
      const url = await getDownloadURL(avatarRef);
      await updateOwnProfile(user.uid, { avatarUrl: url });
    } catch {
      setAvatarError(t("avatarUploadFailed"));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 6) {
      setPasswordError(t("passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("passwordMismatch"));
      return;
    }
    setPasswordSaving(true);
    try {
      const credential = EmailAuthProvider.credential(usernameToEmail(profile.username), currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError(t("currentPasswordIncorrect"));
    } finally {
      setPasswordSaving(false);
    }
  }

  if (!profile) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  const name = localizedName(profile, locale) || profile.username;

  const SECTIONS: { key: Section; label: string }[] = [
    { key: "profile", label: t("sections.profile") },
    { key: "password", label: t("sections.password") },
    { key: "permissions", label: t("sections.permissions") },
  ];

  function actionsFor(resource: (typeof ALL_RESOURCES)[number]) {
    if (resource === "marketing") return ["view"] as const;
    if (resource === "complaints") return [...CRUD_ACTIONS, ...COMPLAINTS_EXTRA_ACTIONS] as const;
    return CRUD_ACTIONS;
  }

  function isGranted(resource: (typeof ALL_RESOURCES)[number], action: string) {
    if (resource === "marketing") return profile!.permissions.marketing.view;
    const grant = profile!.permissions[resource] as unknown as Record<string, boolean>;
    return grant[action] === true;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto sm:w-48 sm:flex-col sm:overflow-visible">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-start text-sm font-medium transition-colors ${
                section === s.key ? "bg-brand text-brand-foreground" : "text-foreground/70 hover:bg-black/5"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {section === "profile" && (
            <div className="rounded-lg border border-border bg-surface p-6">
              <div className="flex items-center gap-4">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-lg font-semibold text-brand-foreground">
                    {initialsOf(name)}
                  </div>
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/70 hover:bg-black/5 disabled:opacity-50"
                  >
                    {avatarUploading ? t("uploading") : t("changePhoto")}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  {avatarError && <p className="mt-1 text-xs text-red-600">{avatarError}</p>}
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-foreground/50">{tFields("nameEn")}</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-foreground/50">{tFields("username")}</dt>
                  <dd className="mt-0.5 text-sm text-foreground">@{profile.username}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-foreground/50">{tFields("number")}</dt>
                  <dd className="mt-0.5 font-mono text-sm text-foreground">{profile.number || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-foreground/50">{tFields("jobTitle")}</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{profile.jobTitle || "—"}</dd>
                </div>
              </dl>

              <form onSubmit={handleSavePhone} className="mt-6 max-w-sm">
                <label htmlFor="phone" className="block text-sm font-medium text-foreground">
                  {tFields("phone")}
                </label>
                <input
                  id="phone"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneSaved(false);
                  }}
                  className={inputClass}
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={phoneSaving}
                    className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50"
                  >
                    {phoneSaving ? tCommon("saving") : tCommon("save")}
                  </button>
                  {phoneSaved && <span className="text-sm text-green-600">{t("saved")}</span>}
                </div>
              </form>
            </div>
          )}

          {section === "password" && (
            <div className="max-w-sm rounded-lg border border-border bg-surface p-6">
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-foreground">
                    {t("currentPassword")}
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
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
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
                    {t("confirmPassword")}
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
                {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
                {passwordSuccess && <p className="text-sm text-green-600">{t("passwordChanged")}</p>}
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50"
                >
                  {passwordSaving ? tCommon("saving") : t("changePassword")}
                </button>
              </form>
            </div>
          )}

          {section === "permissions" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-6">
                <h2 className="text-sm font-semibold text-foreground">{t("myRoles")}</h2>
                {profile.roleIds.length === 0 ? (
                  <p className="mt-2 text-sm text-foreground/50">{tFields("noRoles")}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile.roleIds.map((roleId) => {
                      const role = roles.find((r) => r.id === roleId);
                      return (
                        <span
                          key={roleId}
                          className="rounded-full border border-border bg-black/[0.02] px-3 py-1 text-xs font-medium text-foreground/80"
                        >
                          {role?.name ?? roleId}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-surface p-6">
                <h2 className="text-sm font-semibold text-foreground">{t("myPermissions")}</h2>
                <div className="mt-3 space-y-3">
                  {ALL_RESOURCES.map((resource) => (
                    <div key={resource} className="rounded-lg border border-border p-4">
                      <span className="font-medium text-foreground">{tResources(resource)}</span>
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                        {actionsFor(resource).map((action) => {
                          const granted = isGranted(resource, action);
                          return (
                            <span
                              key={action}
                              className={`flex items-center gap-1.5 text-sm ${
                                granted ? "text-foreground" : "text-foreground/30"
                              }`}
                            >
                              {granted ? "✓" : "✕"} {tActions(action)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
