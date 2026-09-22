"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

// Shared by every file-attachment box in the app (a complaint's own
// attachments, a status-change note's attachments, and a reassign reason's
// attachments, on both Complaints and Tickets) — previously duplicated
// near-verbatim in five places. Pass `controlled` when the URLs need to
// live in a parent's own state (e.g. ComplaintForm's `values.attachmentUrls`,
// which also feeds buildPayload()); omit it for a self-contained instance
// that owns its own state entirely (status-note and reassign attachments).
export interface UseAttachmentUploadOptions {
  storagePathPrefix: string;
  errorMessage: string;
  controlled?: {
    urls: string[];
    setUrls: (updater: (prev: string[]) => string[]) => void;
  };
}

export interface UseAttachmentUploadResult {
  urls: string[];
  uploading: boolean;
  error: string | null;
  dragOver: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  remove: (url: string) => void;
  reset: () => void;
  handleInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: () => void;
  openFilePicker: () => void;
}

export function useAttachmentUpload({
  storagePathPrefix,
  errorMessage,
  controlled,
}: UseAttachmentUploadOptions): UseAttachmentUploadResult {
  const [internalUrls, setInternalUrls] = useState<string[]>([]);
  const urls = controlled ? controlled.urls : internalUrls;
  const setUrls = controlled ? controlled.setUrls : setInternalUrls;

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[]) {
    const fileList = Array.from(files);
    if (!fileList.length) return;
    setError(null);
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        fileList.map(async (file) => {
          // A plain Date.now() prefix collides when several files (often
          // sharing a generic camera/screenshot name) are selected in the
          // same batch — the map callbacks all run synchronously up to this
          // point, so they can get the identical millisecond. That made
          // concurrent uploadBytes calls race to write the same Storage
          // path, silently overwriting all but the last file even though
          // every entry looked "uploaded" in the UI. A random id per file
          // guarantees distinct paths regardless of timing or filename.
          const path = `${storagePathPrefix}/${Date.now()}-${crypto.randomUUID()}-${file.name}`;
          const fileRef = ref(storage, path);
          await uploadBytes(fileRef, file, { contentType: file.type });
          return getDownloadURL(fileRef);
        })
      );
      setUrls((prev) => [...prev, ...uploaded]);
    } catch {
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  }

  function remove(url: string) {
    setUrls((prev) => prev.filter((u) => u !== url));
  }

  function reset() {
    setUrls(() => []);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length) upload(files);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  return {
    urls,
    uploading,
    error,
    dragOver,
    inputRef,
    remove,
    reset,
    handleInputChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
  };
}
