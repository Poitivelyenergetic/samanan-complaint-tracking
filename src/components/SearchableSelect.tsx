"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedItem = useMemo(() => items.find((item) => getId(item) === value) ?? null, [items, value, getId]);

  // Keep the displayed text in sync with the current selection whenever it
  // changes from outside (a new item chosen, the picker cleared/reset by a
  // parent cascade change) — but not while the user is actively typing.
  useEffect(() => {
    if (!open) Promise.resolve().then(() => setQuery(selectedItem ? getLabel(selectedItem) : ""));
  }, [selectedItem, open, getLabel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => getLabel(item).toLowerCase().includes(q));
  }, [items, query, getLabel]);

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
          value={open ? query : selectedItem ? getLabel(selectedItem) : query}
          onFocus={() => {
            // Clear rather than pre-fill with the current selection's label —
            // otherwise typing appends after it instead of searching fresh.
            setQuery("");
            setOpen(true);
          }}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => {
            blurTimeout.current = setTimeout(() => setOpen(false), 150);
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
