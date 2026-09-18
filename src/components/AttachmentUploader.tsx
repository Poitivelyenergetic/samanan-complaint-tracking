"use client";

import type { ChangeEvent, DragEvent, RefObject } from "react";

// The file-attachment box used on every form that lets someone attach
// photos/files — a complaint's own attachments, a status-change note's
// attachments, and a reassign reason's attachments, on both Complaints and
// Tickets. Pairs with useAttachmentUpload, which owns all the actual state
// and upload logic; this component is purely presentational so every one
// of those five call sites renders identically and only needs to change in
// one place.
export interface AttachmentUploaderProps {
  label: string;
  // Renders just a plain list of view links (no upload/remove controls, no
  // dropzone) — used wherever the surrounding form is read-only. Nothing is
  // rendered at all when there are no urls in this mode.
  readOnly?: boolean;
  urls: string[];
  uploading: boolean;
  error: string | null;
  dragOver: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onOpenPicker: () => void;
  onRemove: (url: string) => void;
  viewAttachmentLabel: string;
  removeLabel: string;
  addMoreLabel: string;
  chooseFileLabel: string;
  dropHintLabel: string;
  savingLabel: string;
}

export default function AttachmentUploader({
  label,
  readOnly = false,
  urls,
  uploading,
  error,
  dragOver,
  inputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onInputChange,
  onOpenPicker,
  onRemove,
  viewAttachmentLabel,
  removeLabel,
  addMoreLabel,
  chooseFileLabel,
  dropHintLabel,
  savingLabel,
}: AttachmentUploaderProps) {
  if (readOnly) {
    if (urls.length === 0) return null;
    return (
      <div>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <ul className="mt-1 space-y-1">
          {urls.map((url, i) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand hover:underline">
                {urls.length > 1 ? `${viewAttachmentLabel} ${i + 1}` : viewAttachmentLabel}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`mt-1 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          dragOver ? "border-brand bg-brand/5" : "border-border"
        }`}
      >
        {urls.length > 0 ? (
          <>
            <ul className="w-full space-y-1">
              {urls.map((url, i) => (
                <li key={url} className="flex items-center justify-center gap-2">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">
                    {urls.length > 1 ? `${viewAttachmentLabel} ${i + 1}` : viewAttachmentLabel}
                  </a>
                  <button type="button" onClick={() => onRemove(url)} className="text-xs text-foreground/50 hover:text-red-600">
                    {removeLabel}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onOpenPicker}
              disabled={uploading}
              className="text-xs text-foreground/60 hover:text-foreground disabled:opacity-50"
            >
              {uploading ? savingLabel : addMoreLabel}
            </button>
          </>
        ) : (
          <>
            <p className="text-foreground/60">{dropHintLabel}</p>
            <button
              type="button"
              onClick={onOpenPicker}
              disabled={uploading}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-black/5 disabled:opacity-50"
            >
              {uploading ? savingLabel : chooseFileLabel}
            </button>
          </>
        )}
        <input ref={inputRef} type="file" multiple onChange={onInputChange} className="hidden" />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
