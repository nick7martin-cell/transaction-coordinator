"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, FileText, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type UploadZoneProps = {
  onSuccess?: () => void;
  demoTransactionId?: string | null;
  /** Dashboard layout: no badge, centered intro text and action buttons. */
  variant?: "default" | "dashboard";
};

export function UploadZone({
  onSuccess,
  demoTransactionId,
  variant = "default",
}: UploadZoneProps) {
  const isDashboard = variant === "dashboard";
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Please upload a PDF file.");
        return;
      }

      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("type", "purchase_agreement");

      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Upload failed");
          return;
        }

        onSuccess?.();
        router.push(`/transactions/${data.id}`);
        router.refresh();
      } catch (err) {
        setError("Something went wrong: " + String(err));
      } finally {
        setUploading(false);
      }
    },
    [onSuccess, router]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

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
          Drop in a purchase agreement and Handled extracts the parties, dates,
          and financials automatically — no manual data entry.
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
          handleFiles(e.dataTransfer.files);
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
                Drag &amp; drop your document here
              </p>
              <p className="text-[13px] text-ink-mute mt-1 max-w-xs">
                PDF purchase agreements, addendums, or disclosures
              </p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,application/pdf"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
      </label>

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
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 h-11 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-hover disabled:opacity-50 disabled:pointer-events-none"
        >
          <CloudUpload className="h-4 w-4" />
          Upload purchase agreement
        </button>
        <button
          type="button"
          disabled={!demoTransactionId}
          onClick={() => {
            if (demoTransactionId) router.push(`/transactions/${demoTransactionId}`);
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 h-11 text-sm font-semibold text-ink-soft transition-colors hover:text-ink hover:border-ink-mute/40 disabled:opacity-50 disabled:pointer-events-none"
        >
          <FileText className="h-4 w-4 text-ink-mute" />
          View demo transaction
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-danger bg-danger/40 px-4 py-3 text-sm text-danger-ink">
          {error}
        </div>
      )}
    </div>
  );
}
