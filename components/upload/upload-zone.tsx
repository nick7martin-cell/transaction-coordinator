"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CloudUpload,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import {
  countPdfFiles,
  isAllowedUploadFile,
  isImageFile,
  isPdfFile,
} from "@/lib/upload-files";
import { cn } from "@/lib/utils";

/** Hard cap on Vercel serverless request bodies — not raised via next.config. */
const MAX_UPLOAD_BYTES = Math.floor(4.5 * 1024 * 1024);

type UploadZoneProps = {
  onSuccess?: () => void;
  /** Dashboard layout: no badge, centered intro text and action buttons. */
  variant?: "default" | "dashboard";
};

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function mergeFiles(existing: File[], incoming: File[]): File[] {
  const seen = new Set(existing.map(fileKey));
  const merged = [...existing];
  for (const file of incoming) {
    const key = fileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  return merged;
}

function totalUploadBytes(files: File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

function payloadTooLargeMessage(totalBytes: number): string {
  const mb = (totalBytes / (1024 * 1024)).toFixed(1);
  return `These files total ${mb} MB, which exceeds the 4.5 MB upload limit. Try a compressed PDF or remove large attachments before extracting.`;
}

async function postExtract(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const res = await fetch("/api/extract", {
    method: "POST",
    body: formData,
  });
  const text = await res.text();

  let data: { error?: string; id?: string } = {};
  try {
    data = JSON.parse(text) as { error?: string; id?: string };
  } catch {
    if (
      res.status === 413 ||
      /request entity too large|function_payload_too_large|body exceeded/i.test(
        text
      )
    ) {
      return {
        ok: false,
        error:
          "The upload exceeds the 4.5 MB size limit. Try a compressed PDF or remove large attachments before extracting.",
      };
    }
    return {
      ok: false,
      error: res.ok
        ? "Upload failed — unexpected server response."
        : `Upload failed (${res.status}). Please try again.`,
    };
  }

  if (!res.ok) {
    return { ok: false, error: data.error || "Upload failed" };
  }

  if (!data.id) {
    return { ok: false, error: "Upload failed — unexpected server response." };
  }

  return { ok: true, id: data.id };
}

export function UploadZone({
  onSuccess,
  variant = "default",
}: UploadZoneProps) {
  const isDashboard = variant === "dashboard";
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming || incoming.length === 0) return;

    const files = Array.from(incoming);
    const invalid = files.filter((f) => !isAllowedUploadFile(f));
    if (invalid.length > 0) {
      setError(
        "Unsupported file type. Use a PDF purchase agreement and optional JPEG, PNG, GIF, or WebP images."
      );
      return;
    }

    setSelectedFiles((prev) => {
      const merged = mergeFiles(prev, files);
      if (countPdfFiles(merged) > 1) {
        setError("Only one PDF purchase agreement can be included.");
        return prev;
      }
      if (totalUploadBytes(merged) > MAX_UPLOAD_BYTES) {
        setError(payloadTooLargeMessage(totalUploadBytes(merged)));
        return prev;
      }
      setError(null);
      return merged;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }, []);

  const runExtraction = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    if (countPdfFiles(selectedFiles) === 0) {
      setError("Please include the purchase agreement PDF.");
      return;
    }

    const uploadBytes = totalUploadBytes(selectedFiles);
    if (uploadBytes > MAX_UPLOAD_BYTES) {
      setError(payloadTooLargeMessage(uploadBytes));
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("type", "purchase_agreement");
    for (const file of selectedFiles) {
      formData.append("files", file);
    }
    if (notes.trim()) {
      formData.append("notes", notes.trim());
    }

    try {
      const result = await postExtract(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      onSuccess?.();
      router.push(`/transactions/${result.id}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  }, [notes, onSuccess, router, selectedFiles]);

  const hasFiles = selectedFiles.length > 0;

  return (
    <div
      id="upload"
      className="rounded-[20px] bg-surface p-7 md:p-8 shadow-card border border-line"
    >
      {!isDashboard && (
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-ink-mute">
          <Sparkles className="h-3.5 w-3.5 text-brand" />
          AI-powered intake
        </div>
      )}
      <div className={cn(isDashboard && "text-center")}>
        <h2
          className={cn(
            "text-[26px] leading-tight font-semibold text-ink tracking-tight",
            isDashboard ? "mt-0" : "mt-2"
          )}
        >
          Create a transaction in seconds
        </h2>
        <p
          className={cn(
            "text-[15px] text-ink-soft mt-2 max-w-xl",
            isDashboard && "mx-auto"
          )}
        >
          Add the purchase agreement PDF plus any supporting screenshots, then
          extract parties, dates, and financials automatically.
        </p>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "mt-6 flex flex-col items-center justify-center w-full h-52 rounded-[16px] cursor-pointer transition-colors",
          "border border-dashed",
          dragOver
            ? "border-brand/40 bg-brand/[0.04]"
            : "border-line bg-canvas hover:border-brand/30 hover:bg-canvas/60",
          uploading && "pointer-events-none opacity-80"
        )}
      >
        <div className="flex flex-col items-center justify-center px-4 text-center">
          {uploading ? (
            <>
              <div className="h-14 w-14 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-center mb-3">
                <Loader2 className="h-6 w-6 text-brand animate-spin" />
              </div>
              <p className="text-sm font-semibold text-ink">
                Extracting contract terms…
              </p>
              <p className="text-[13px] text-ink-mute mt-1">
                This usually takes under a minute
              </p>
            </>
          ) : (
            <>
              <div className="h-14 w-14 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-center mb-3">
                <CloudUpload className="h-6 w-6 text-brand" />
              </div>
              <p className="text-sm font-semibold text-ink">
                Drag &amp; drop files here
              </p>
              <p className="text-[13px] text-ink-mute mt-1 max-w-xs">
                PDF purchase agreement plus optional screenshots (emails,
                Transaction Desk, etc.)
              </p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,application/pdf,image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
          multiple
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          disabled={uploading}
        />
      </label>

      {hasFiles && !uploading && (
        <ul className="mt-4 space-y-2">
          {selectedFiles.map((file, index) => (
            <li
              key={fileKey(file)}
              className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2"
            >
              {isPdfFile(file) ? (
                <FileText className="h-4 w-4 shrink-0 text-brand" />
              ) : (
                <ImageIcon className="h-4 w-4 shrink-0 text-brand" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {file.name}
              </span>
              <span className="text-xs text-ink-mute shrink-0">
                {isPdfFile(file) ? "PDF" : isImageFile(file) ? "Image" : "File"}
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="rounded-lg p-1 text-ink-mute hover:text-ink hover:bg-surface transition-colors"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <label
          htmlFor="upload-notes"
          className="block text-sm font-medium text-ink-soft mb-1.5"
        >
          Additional notes{" "}
          <span className="font-normal text-ink-mute">(optional)</span>
        </label>
        <textarea
          id="upload-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={uploading}
          rows={3}
          placeholder="Paste listing agent, title closer, lender, or buyer/seller emails and phone numbers — Claude will add them to Transaction Contacts…"
          className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/40 disabled:opacity-60 resize-y min-h-[72px]"
        />
      </div>

      <div
        className={cn(
          "mt-5 flex flex-wrap items-center gap-3",
          isDashboard && "justify-center"
        )}
      >
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 h-11 text-sm font-semibold text-ink-soft transition-colors hover:text-ink hover:border-ink-mute/40 disabled:opacity-50 disabled:pointer-events-none"
        >
          <CloudUpload className="h-4 w-4" />
          Choose files
        </button>
        {hasFiles && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => void runExtraction()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 h-11 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-hover disabled:opacity-50 disabled:pointer-events-none"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Extract
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-danger bg-danger/40 px-4 py-3 text-sm text-danger-ink">
          {error}
        </div>
      )}
    </div>
  );
}
