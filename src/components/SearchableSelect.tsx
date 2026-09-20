"use client";

import { useLocale } from "next-intl";
import { useMemo, useRef, useState } from "react";

interface SearchableSelectProps<T> {
  items: readonly T[];
  value: string; // selected item's id, "" = none selected
  onChange: (id: string) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  // Hide the "×" clear button — for fields that always require a value
  // (e.g. a complaint's status), clearing to "" is invalid.
  allowClear?: boolean;
  // Overrides the input's default styling — for compact/inline filter spots
  // (e.g. a chart card's corner control) that need a quieter look than the
  // standard full-size form field.
  className?: string;
}

const DEFAULT_INPUT_CLASS =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60";

// A type-to-search combobox: styled like the app's other inputs, but backed
// by a filtered dropdown instead of a native <select>. Used everywhere the
// New Complaint form's Company/Administration/Department/Employee pickers
// need to be searchable rather than a plain (long) dropdown list.
export default function SearchableSelect<T>({
  items,
  value,
  onChange,
  getId,
  getLabel,
  placeholder = "",
  disabled = false,
  id,
  ariaLabel,
  allowClear = true,
  className,
}: SearchableSelectProps<T>) {
  // Alphabetized in the active locale's own order (a/b/c for English,
  // أ/ب/ت for Arabic) rather than whatever order the source list happens
  // to be in (Firestore's insertion order) — every consumer of this
  // component gets this for free instead of having to sort its own list.
  const locale = useLocale();
  const collator = useMemo(() => new Intl.Collator(locale, { sensitivity: "base" }), [locale]);
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => collator.compare(getLabel(a), getLabel(b))),
    [items, getLabel, collator]
  );

  // Lazily computed straight from props (not the selectedItem/selectedLabel
  // below) so the field shows the right text — the current selection's
  // label, "All statuses" and the like included — from its very first
  // render, rather than blank until something later changes the selection.
  const [query, setQuery] = useState(() => {
    const initialItem = items.find((item) => getId(item) === value);
    return initialItem ? getLabel(initialItem) : "";
  });
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedItem = useMemo(() => items.find((item) => getId(item) === value) ?? null, [items, value, getId]);
  const selectedLabel = selectedItem ? getLabel(selectedItem) : "";

  // Keep the displayed text in sync with the current selection whenever it
  // changes from outside (a new item chosen, the picker cleared/reset by a
  // parent cascade change) — but not while the field is focused, so it
  // doesn't fight the user's own typing. Adjusted during render (the
  // React-recommended way to sync state to a changing external value)
  // rather than in an effect.
  //
  // This used to key off `open` instead of `focused`, which broke editing
  // after picking an item: selecting sets open=false but the input (by
  // design — see the option buttons' onMouseDown below) never loses focus,
  // so the field was stuck showing the selected label with every keystroke
  // silently overridden, Backspace included, until the user blurred and
  // refocused it.
  //
  // Restoring also has to happen on every focus->blur transition, not just
  // when selectedLabel itself changes: onFocus clears `query` to "" so the
  // user can type, and if they click away without picking anything,
  // selectedLabel is back to whatever it already was — comparing it
  // against a stale cached string (the old approach) saw no change and
  // skipped the restore, leaving the field permanently blank instead of
  // showing "All"/whatever was selected. Tracking `focused` itself instead
  // catches that transition unconditionally.
  const syncKey = focused ? null : selectedLabel;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  const [wasFocused, setWasFocused] = useState(focused);
  if (wasFocused !== focused) {
    setWasFocused(focused);
    if (!focused) {
      setSyncedKey(selectedLabel);
      setQuery(selectedLabel);
    }
  } else if (syncKey !== null && syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setQuery(syncKey);
  }

  // Names starting with what was typed are almost always what's being
  // looked for — listing them ahead of names that merely contain the
  // query somewhere in the middle (e.g. searching "m" should surface
  // "Mohammed" before "Ahmed") makes the common case reachable without
  // typing more. sortedItems is already alphabetized, so each group keeps
  // that order internally.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedItems;
    const startsWith: T[] = [];
    const containsOnly: T[] = [];
    for (const item of sortedItems) {
      const label = getLabel(item).toLowerCase();
      if (label.startsWith(q)) startsWith.push(item);
      else if (label.includes(q)) containsOnly.push(item);
    }
    return [...startsWith, ...containsOnly];
  }, [sortedItems, query, getLabel]);

  function selectItem(item: T) {
    onChange(getId(item));
    setQuery(getLabel(item));
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="off"
          aria-label={ariaLabel}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onFocus={() => {
            // Clear rather than pre-fill with the current selection's label —
            // otherwise typing appends after it instead of searching fresh.
            setFocused(true);
            setQuery("");
            setOpen(true);
          }}
          onClick={() => {
            // Picking an option (see the option buttons' onMouseDown below)
            // keeps focus on this input rather than blurring it, so a second
            // click right after picking something doesn't fire a new native
            // focus event — onFocus above never reruns, and without this the
            // list stayed closed until the user typed a character to trigger
            // it via onChange instead. A plain click always fires though, so
            // reopen here too whenever the list isn't already open.
            if (!open) {
              setQuery("");
              setOpen(true);
            }
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            // Re-open on every keystroke, not just on focus — editing right
            // after picking an item (see above) starts with open already
            // false, and without this the dropdown would never come back.
            setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            blurTimeout.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => {
            // Every instance of this component lives inside a <form> —
            // without this, Enter (the natural "confirm my choice" key
            // while typing to filter) submits/autosaves the whole form
            // instead of picking the highlighted match.
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && filtered.length > 0) selectItem(filtered[0]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className={className ?? DEFAULT_INPUT_CLASS}
        />
        {selectedItem && !disabled && allowClear && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault();
              clear();
            }}
            className="absolute end-2 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground"
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-foreground/50">—</p>
          ) : (
            filtered.map((item) => (
              <button
                key={getId(item)}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  selectItem(item);
                }}
                className={`block w-full px-3 py-2 text-start text-sm hover:bg-black/5 ${
                  getId(item) === value ? "bg-brand/10 font-medium text-brand" : "text-foreground"
                }`}
              >
                {getLabel(item)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
