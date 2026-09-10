"use client";

import { useTranslations } from "next-intl";
import { CRUD_ACTIONS, PERMISSION_RESOURCES, type RolePermissions } from "@/lib/types";

interface RolePermissionsEditorProps {
  value: RolePermissions;
  onChange: (next: RolePermissions) => void;
}

const ALL_RESOURCES = [...PERMISSION_RESOURCES, "marketing" as const];
const COMPLAINTS_EXTRA_ACTIONS = ["viewAll", "reassign", "acceptReassignment"] as const;

export default function RolePermissionsEditor({ value, onChange }: RolePermissionsEditorProps) {
  const t = useTranslations("roles.resources");
  const tActions = useTranslations("roles.actions");

  const allGranted = ALL_RESOURCES.every((resource) =>
    resource === "marketing"
      ? value.marketing.view
      : resource === "complaints"
        ? CRUD_ACTIONS.every((action) => value.complaints[action]) &&
          value.complaints.viewAll &&
          value.complaints.reassign &&
          value.complaints.acceptReassignment
        : CRUD_ACTIONS.every((action) => value[resource][action])
  );

  function toggleAll(next: boolean) {
    const updated: RolePermissions = {
      companies: { view: next, create: next, update: next, delete: next },
      administrations: { view: next, create: next, update: next, delete: next },
      departments: { view: next, create: next, update: next, delete: next },
      employees: { view: next, create: next, update: next, delete: next },
      complaints: {
        view: next,
        create: next,
        update: next,
        delete: next,
        viewAll: next,
        reassign: next,
        acceptReassignment: next,
      },
      roles: { view: next, create: next, update: next, delete: next },
      marketing: { view: next },
      complaintTypes: { view: next, create: next, update: next, delete: next },
      complaintSources: { view: next, create: next, update: next, delete: next },
    };
    onChange(updated);
  }

  function toggleResourceAll(resource: (typeof ALL_RESOURCES)[number], next: boolean) {
    if (resource === "marketing") {
      onChange({ ...value, marketing: { view: next } });
      return;
    }
    if (resource === "complaints") {
      onChange({
        ...value,
        complaints: {
          view: next,
          create: next,
          update: next,
          delete: next,
          viewAll: next,
          reassign: next,
          acceptReassignment: next,
        },
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

  function toggleComplaintsExtra(action: (typeof COMPLAINTS_EXTRA_ACTIONS)[number], next: boolean) {
    onChange({ ...value, complaints: { ...value.complaints, [action]: next } });
  }

  function isResourceAllGranted(resource: (typeof ALL_RESOURCES)[number]) {
    if (resource === "marketing") return value.marketing.view;
    if (resource === "complaints") {
      return (
        CRUD_ACTIONS.every((action) => value.complaints[action]) &&
        value.complaints.viewAll &&
        value.complaints.reassign &&
        value.complaints.acceptReassignment
      );
    }
    return CRUD_ACTIONS.every((action) => value[resource][action]);
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
          const isComplaints = resource === "complaints";
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
                    {isComplaints &&
                      COMPLAINTS_EXTRA_ACTIONS.map((action) => (
                        <label key={action} className="flex items-center gap-2 text-sm text-foreground/80">
                          <input
                            type="checkbox"
                            checked={value.complaints[action]}
                            onChange={(e) => toggleComplaintsExtra(action, e.target.checked)}
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
