"use client";

import { useTranslations } from "next-intl";
import { CRUD_ACTIONS, PERMISSION_RESOURCES, type RolePermissions } from "@/lib/types";

interface RolePermissionsEditorProps {
  value: RolePermissions;
  onChange: (next: RolePermissions) => void;
}

const ALL_RESOURCES = [...PERMISSION_RESOURCES, "marketing" as const];
// Tickets carries the same two extra flags as complaints (viewAll,
// reassign) beyond the standard CRUD set. Complaints alone also gets
// editDetails — see ComplaintsPermission / TicketsPermission in
// lib/types.ts for why (only complaints has the body-lock feature).
const EXTRA_ACTIONS_BY_RESOURCE = {
  complaints: ["viewAll", "reassign", "editDetails"],
  tickets: ["viewAll", "reassign"],
} as const;
const RESOURCES_WITH_EXTRA_ACTIONS = ["complaints", "tickets"] as const;

function hasExtraActions(
  resource: (typeof ALL_RESOURCES)[number]
): resource is (typeof RESOURCES_WITH_EXTRA_ACTIONS)[number] {
  return (RESOURCES_WITH_EXTRA_ACTIONS as readonly string[]).includes(resource);
}

export default function RolePermissionsEditor({ value, onChange }: RolePermissionsEditorProps) {
  const t = useTranslations("roles.resources");
  const tActions = useTranslations("roles.actions");

  function isResourceAllGranted(resource: (typeof ALL_RESOURCES)[number]) {
    if (resource === "marketing") return value.marketing.view;
    if (hasExtraActions(resource)) {
      const perm = value[resource] as unknown as Record<string, boolean>;
      return (
        CRUD_ACTIONS.every((action) => perm[action]) &&
        EXTRA_ACTIONS_BY_RESOURCE[resource].every((action) => perm[action])
      );
    }
    return CRUD_ACTIONS.every((action) => value[resource][action]);
  }

  const allGranted = ALL_RESOURCES.every((resource) => isResourceAllGranted(resource));

  function toggleAll(next: boolean) {
    const updated: RolePermissions = {
      companies: { view: next, create: next, update: next, delete: next },
      administrations: { view: next, create: next, update: next, delete: next },
      departments: { view: next, create: next, update: next, delete: next },
      employees: { view: next, create: next, update: next, delete: next },
      complaints: { view: next, create: next, update: next, delete: next, viewAll: next, reassign: next, editDetails: next },
      roles: { view: next, create: next, update: next, delete: next },
      marketing: { view: next },
      complaintTypes: { view: next, create: next, update: next, delete: next },
      complaintSources: { view: next, create: next, update: next, delete: next },
      tickets: { view: next, create: next, update: next, delete: next, viewAll: next, reassign: next },
      ticketTypes: { view: next, create: next, update: next, delete: next },
      ticketSources: { view: next, create: next, update: next, delete: next },
    };
    onChange(updated);
  }

  function toggleResourceAll(resource: (typeof ALL_RESOURCES)[number], next: boolean) {
    if (resource === "marketing") {
      onChange({ ...value, marketing: { view: next } });
      return;
    }
    if (hasExtraActions(resource)) {
      const extra = Object.fromEntries(EXTRA_ACTIONS_BY_RESOURCE[resource].map((action) => [action, next]));
      onChange({
        ...value,
        [resource]: { view: next, create: next, update: next, delete: next, ...extra },
      });
      return;
    }
    onChange({ ...value, [resource]: { view: next, create: next, update: next, delete: next } });
  }

  function toggleAction(
    resource: (typeof PERMISSION_RESOURCES)[number],
    action: (typeof CRUD_ACTIONS)[number],
    next: boolean
  ) {
    onChange({ ...value, [resource]: { ...value[resource], [action]: next } });
  }

  function toggleExtraAction(
    resource: (typeof RESOURCES_WITH_EXTRA_ACTIONS)[number],
    action: (typeof EXTRA_ACTIONS_BY_RESOURCE)[typeof resource][number],
    next: boolean
  ) {
    onChange({ ...value, [resource]: { ...value[resource], [action]: next } });
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={allGranted}
          onChange={(e) => toggleAll(e.target.checked)}
          className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
        />
        {t("selectAll")}
      </label>

      <div className="space-y-3">
        {ALL_RESOURCES.map((resource) => {
          const isMarketing = resource === "marketing";
          const resourceAllGranted = isResourceAllGranted(resource);

          return (
            <div key={resource} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">{t(resource)}</span>
                <button
                  type="button"
                  onClick={() => toggleResourceAll(resource, !resourceAllGranted)}
                  className="text-sm text-brand hover:underline"
                >
                  {resourceAllGranted ? t("clearAll") : t("selectAllShort")}
                </button>
              </div>
              {resource === "complaints" && (
                <p className="mt-1 text-xs text-foreground/50">{t("complaintsPermissionHint")}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {isMarketing ? (
                  <label className="flex items-center gap-2 text-sm text-foreground/80">
                    <input
                      type="checkbox"
                      checked={value.marketing.view}
                      onChange={(e) => onChange({ ...value, marketing: { view: e.target.checked } })}
                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    {tActions("view")}
                  </label>
                ) : (
                  <>
                    {CRUD_ACTIONS.map((action) => (
                      <label key={action} className="flex items-center gap-2 text-sm text-foreground/80">
                        <input
                          type="checkbox"
                          checked={value[resource][action]}
                          onChange={(e) => toggleAction(resource, action, e.target.checked)}
                          className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                        />
                        {tActions(action)}
                      </label>
                    ))}
                    {hasExtraActions(resource) &&
                      EXTRA_ACTIONS_BY_RESOURCE[resource].map((action) => (
                        <label key={action} className="flex items-center gap-2 text-sm text-foreground/80">
                          <input
                            type="checkbox"
                            checked={(value[resource] as unknown as Record<string, boolean>)[action]}
                            onChange={(e) => toggleExtraAction(resource, action, e.target.checked)}
                            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                          />
                          {tActions(action)}
                        </label>
                      ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
