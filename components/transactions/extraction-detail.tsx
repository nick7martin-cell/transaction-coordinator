"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PropertyImage } from "@/components/ui/property-image";
import { StatusBadge } from "@/components/ui/status-badge";
import { CommissionCalculator } from "@/components/transactions/commission-calculator";
import { TransactionPartiesSection } from "@/components/transactions/parties-section";
import {
  formatCurrency,
  formatDate,
  formatPercent,
  daysUntilClosing,
} from "@/lib/format";
import { teamSteadyEmailFor } from "@/lib/agents";
import { partiesToWorksheet } from "@/lib/parties-worksheet";
import { buildInitialParties } from "@/lib/transaction-seed";
import { getInspectionProgress } from "@/lib/inspection-progress";
import { resolveStatus } from "@/lib/transaction-lifecycle";
import { getTransactionStatus } from "@/lib/transaction-status";
import {
  coerceExtractedData,
  detectDualAgency,
  makeParty,
  type Contact,
  type PersistedTransactionStatus,
  type Transaction,
  type TransactionMeta,
  type TransactionParty,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Camera,
  CheckCircle,
  ClipboardList,
  Clock,
  FileUp,
  Loader2,
  Mail,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { dispatchPropertyPhotoUpdated, propertyImageSrc } from "@/lib/property-image";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const cardCls = "rounded-[20px] bg-surface border border-line shadow-card overflow-hidden";

// ── MLS Badge (editable overlay) ──────────────────────────────────────────────

function MLSBadgeEditor({
  value,
  onChange,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <div className="rounded-lg bg-black/70 px-2.5 py-1 backdrop-blur-sm">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => { setEditing(false); onSave(value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { setEditing(false); onSave(value); }
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="MLS #"
          className="bg-transparent text-white text-xs font-semibold outline-none placeholder:text-white/50 w-28"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to set MLS number"
      className={cn(
        "rounded-lg px-2.5 py-1 text-xs font-semibold backdrop-blur-sm transition-colors",
        value
          ? "bg-black/55 text-white hover:bg-black/70"
          : "bg-black/35 text-white/70 hover:bg-black/55 hover:text-white border border-white/25"
      )}
    >
      {value ? `MLS ${value}` : "+ MLS #"}
    </button>
  );
}

// ── Photo helpers ─────────────────────────────────────────────────────────────

/** Resize + JPEG-compress an image file to a data URL small enough for JSONB. */
function compressImage(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── Hero photo (custom upload → Street View → skeleton) ───────────────────────

function HeroPhoto({
  seed,
  src,
  status,
  mlsValue,
  uploading,
  onMlsChange,
  onMlsSave,
  onUpload,
}: {
  seed: string;
  src: string | null;
  status: Parameters<typeof StatusBadge>[0]["status"];
  mlsValue: string;
  uploading: boolean;
  onMlsChange: (v: string) => void;
  onMlsSave: (v: string) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="group relative min-h-[240px] overflow-hidden rounded-[16px] border border-line bg-line">
      <PropertyImage seed={seed} src={src} className="absolute inset-0 h-full w-full" iconSize={56} />

      {/* Status pill — top left */}
      <div className="absolute left-3 top-3 z-10">
        <StatusBadge status={status} variant="pill" />
      </div>

      {/* Upload control — top right, appears on hover */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title="Upload a custom photo (JPG or PNG)"
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/70 focus:opacity-100 group-hover:opacity-100"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={onUpload}
      />

      {/* MLS # — bottom right */}
      <div className="absolute bottom-3 right-3 z-10">
        <MLSBadgeEditor value={mlsValue} onChange={onMlsChange} onSave={onMlsSave} />
      </div>
    </div>
  );
}

// ── Deadline Card ─────────────────────────────────────────────────────────────

function DeadlineCard({
  label,
  date,
  icon: Icon,
  daysLeft,
}: {
  label: string;
  date: string | null | undefined;
  icon: React.ElementType;
  daysLeft: number | null;
}) {
  const variant =
    daysLeft === null || daysLeft < 0 ? "muted"
    : daysLeft <= 2 ? "danger"
    : daysLeft <= 5 ? "warn"
    : "good";

  const styles = {
    danger: { card: "border-danger bg-danger/35", icon: "text-danger-ink", badge: "bg-danger text-danger-ink" },
    warn:   { card: "border-warn bg-warn/45",     icon: "text-warn-ink",   badge: "bg-warn text-warn-ink" },
    good:   { card: "border-good bg-good/45",     icon: "text-good-ink",   badge: "bg-good text-good-ink" },
    muted:  { card: "border-line bg-canvas",      icon: "text-ink-mute",   badge: "bg-line text-ink-soft" },
  }[variant];

  const daysLabel =
    daysLeft === null ? null
    : daysLeft < 0    ? "Past"
    : daysLeft === 0  ? "Today"
    : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;

  return (
    <div className={cn("rounded-[20px] border p-5 flex items-center gap-4 shadow-card", styles.card)}>
      <div className={cn("shrink-0", styles.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[11px] font-semibold uppercase tracking-wider", styles.icon)}>
          {label}
        </p>
        <p className="text-[16px] font-semibold text-ink mt-0.5">
          {date ? formatDate(date) : "—"}
        </p>
      </div>
      {daysLabel && (
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold shrink-0", styles.badge)}>
          {daysLabel}
        </span>
      )}
    </div>
  );
}

function InspectionPeriodCard({
  inspectionPeriodDays,
}: {
  inspectionPeriodDays: number | null | undefined;
}) {
  const value =
    inspectionPeriodDays == null || inspectionPeriodDays === 0
      ? "No Inspection"
      : `${inspectionPeriodDays} Day Inspection`;

  return (
    <div className="rounded-[20px] border p-5 flex items-center gap-4 shadow-card border-line bg-canvas">
      <div className="shrink-0 text-ink-mute">
        <ClipboardList className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
          Inspection
        </p>
        <p className="text-[16px] font-semibold text-ink mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-line/60 last:border-0">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="text-sm font-medium text-ink text-right">{value ?? "—"}</span>
    </div>
  );
}

function EditableDateRow({
  label,
  value,
  saving,
  onSave,
}: {
  label: string;
  value: string | null;
  saving?: boolean;
  onSave: (isoDate: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocal(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (local && local !== (value ?? "")) onSave(local);
  }

  const display = value ? formatDate(value) : "—";

  if (editing) {
    return (
      <div className="flex justify-between items-center gap-4 py-2.5 border-b border-line/60 last:border-0">
        <span className="text-sm text-ink-soft">{label}</span>
        <input
          ref={inputRef}
          type="date"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setLocal(value ?? ""); setEditing(false); }
          }}
          className="rounded-lg border border-line bg-surface px-2.5 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center gap-4 py-2.5 border-b border-line/60 last:border-0">
      <span className="text-sm text-ink-soft">{label}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={saving}
        title="Click to edit date"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink text-right rounded-md px-1 -mr-1 hover:bg-line/50 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-mute" /> : null}
        <span className={!value ? "text-ink-mute" : undefined}>{display}</span>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ExtractionDetail({
  transaction,
  onTransactionChange,
}: {
  transaction: Transaction;
  onTransactionChange?: (t: Transaction) => void;
}) {
  const router = useRouter();
  const data = coerceExtractedData(transaction.extracted_data);
  const days = daysUntilClosing(data.closingDate);
  const status = getTransactionStatus(transaction);
  const seed = data.propertyAddress || transaction.id;
  const dualAgency = detectDualAgency(data);

  const inspectionEndDate =
    data.inspectionContingencyExpirationDate ??
    (data.acceptanceDate && data.inspectionPeriodDays
      ? addDaysToDate(data.acceptanceDate, data.inspectionPeriodDays)
      : null);

  const inspection = getInspectionProgress(
    data.acceptanceDate,
    data.inspectionPeriodDays,
    inspectionEndDate
  );

  const inspectionLabel = (() => {
    const parts: string[] = [];
    if (data.inspectionPeriodDays != null) parts.push(`${data.inspectionPeriodDays} days`);
    if (inspectionEndDate) parts.push(`expires ${formatDate(inspectionEndDate)}`);
    return parts.length ? parts.join(" · ") : null;
  })();

  // ── State ──────────────────────────────────────────────────────────────────

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const dismissKey = `handled-banner-dismissed-${transaction.id}`;
  useEffect(() => {
    if (localStorage.getItem(dismissKey) === "true") setBannerDismissed(true);
  }, [dismissKey]);

  const [note, setNote] = useState("");
  const noteKey = `handled-note-${transaction.id}`;
  useEffect(() => {
    const saved = localStorage.getItem(noteKey);
    if (saved) setNote(saved);
  }, [noteKey]);

  const [mlsValue, setMlsValue] = useState(data.mlsNumber ?? "");
  const [meta, setMeta] = useState<TransactionMeta | null>(null);
  const [parties, setParties] = useState<TransactionParty[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [reExtractError, setReExtractError] = useState<string | null>(null);
  const [reExtractSummary, setReExtractSummary] = useState<{
    filled: { field: string; label: string; value: string }[];
    partiesAdded: { label: string; name: string }[];
  } | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [draftingEmail, setDraftingEmail] = useState(false);
  const [draftEmailFeedback, setDraftEmailFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [savingAcceptanceDate, setSavingAcceptanceDate] = useState(false);
  const paInputRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);

  // Always-current snapshot of the roster so mutation handlers never read a
  // stale render closure (which previously dropped rapid successive edits).
  const partiesRef = useRef<TransactionParty[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { partiesRef.current = parties; }, [parties]);

  /** Generic meta PATCH for non-roster fields (MLS, etc.). */
  const patchMeta = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/transactions/${transaction.id}/meta`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await res.json();
        if (res.ok && d.meta) setMeta(d.meta);
      } catch { /* keep optimistic state */ } finally {
        setSaving(false);
      }
    },
    [transaction.id]
  );

  /**
   * Persist the parties roster. Edits are applied optimistically and to a ref
   * (so the next edit always builds on the latest state), then a single
   * debounced PATCH writes the full roster + worksheet sync to Supabase. We
   * never overwrite local state from the response, avoiding races that used to
   * drop rapid edits.
   */
  const persistParties = useCallback(
    (next: TransactionParty[]) => {
      partiesRef.current = next; // synchronous latest snapshot
      setParties(next);          // optimistic UI

      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaving(true);
      saveTimer.current = setTimeout(() => {
        const latest = partiesRef.current;
        const body = { parties: latest, worksheet: partiesToWorksheet(latest) };
        console.log(`[contacts] saving ${latest.length} contacts → transaction ${transaction.id}`, latest);
        fetch(`/api/transactions/${transaction.id}/meta`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then(async (res) => {
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
              console.error("[contacts] save FAILED", res.status, d);
              return;
            }
            const saved = Array.isArray(d.meta?.parties) ? d.meta.parties.length : "?";
            console.log(`[contacts] save OK ✓ — ${saved} contacts persisted`);
            if (d.meta) setMeta(d.meta);
          })
          .catch((e) => console.error("[contacts] save error", e))
          .finally(() => setSaving(false));
      }, 300);
    },
    [transaction.id]
  );

  /** Immediately write any pending roster edit (used before opening the worksheet). */
  const flushParties = useCallback(async () => {
    if (!saveTimer.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const latest = partiesRef.current;
    setSaving(true);
    try {
      await fetch(`/api/transactions/${transaction.id}/meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parties: latest, worksheet: partiesToWorksheet(latest) }),
      });
      console.log("[contacts] flushed pending save before opening worksheet");
    } catch (e) { console.error("[contacts] flush error", e); }
    finally { setSaving(false); }
  }, [transaction.id]);

  const loadMeta = useCallback(async () => {
    try {
      const [metaRes, contactsRes] = await Promise.all([
        fetch(`/api/transactions/${transaction.id}/meta`),
        fetch("/api/contacts"),
      ]);
      const [d, cData] = await Promise.all([metaRes.json(), contactsRes.json()]);
      const m: TransactionMeta | null = d.meta ?? null;
      const contactsList: Contact[] = Array.isArray(cData.contacts) ? cData.contacts : [];
      setMeta(m);
      setContacts(contactsList);
      setMlsValue(m?.worksheet?.mlsNumber ?? data.mlsNumber ?? "");
      setPhotoUrl((m?.worksheet?.propertyPhotoUrl as string | undefined) ?? null);

      if (m?.parties && Array.isArray(m.parties) && m.parties.length > 0) {
        console.log(`[contacts] loaded ${m.parties.length} saved contacts from Supabase`);
        partiesRef.current = m.parties;
        setParties(m.parties);
      } else {
        const seeded = buildInitialParties(data, contactsList);
        console.log(`[contacts] no saved roster — seeding ${seeded.length} from extraction`);
        partiesRef.current = seeded;
        setParties(seeded);
        if (!seededRef.current && seeded.length > 0) {
          seededRef.current = true;
          void patchMeta({ parties: seeded, worksheet: partiesToWorksheet(seeded) });
        }
      }
    } catch (e) { console.error("[contacts] load error", e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction.id]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  useEffect(() => {
    fetch("/api/auth/google/status")
      .then((res) => res.json())
      .then((data) => setGmailConnected(!!data.connected))
      .catch(() => setGmailConnected(false));
  }, []);

  async function handleDraftConnectionEmail() {
    setDraftingEmail(true);
    setDraftEmailFeedback(null);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/draft-email`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create draft");
      }
      setDraftEmailFeedback({
        type: "success",
        message: "Draft created — check Gmail",
      });
    } catch (err) {
      setDraftEmailFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to create draft",
      });
    } finally {
      setDraftingEmail(false);
    }
  }

  function saveMls(v: string) {
    void patchMeta({ worksheet: { mlsNumber: v } });
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || !/image\/(jpeg|png)/.test(file.type)) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await compressImage(file, 1000, 0.72);
      setPhotoUrl(dataUrl); // optimistic
      await patchMeta({ worksheet: { propertyPhotoUrl: dataUrl } });
      dispatchPropertyPhotoUpdated(transaction.id, dataUrl);
      console.log("[photo] uploaded custom property photo");
    } catch (err) {
      console.error("[photo] upload failed", err);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) {
        setReExtractError(d.error || "Could not delete transaction");
        setShowDeleteConfirm(false);
        return;
      }
      router.push("/");
    } catch {
      setReExtractError("Could not delete transaction");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleReExtract(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setReExtractError("Please upload a PDF file.");
      return;
    }

    setReExtracting(true);
    setReExtractError(null);
    setReExtractSummary(null);

    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res = await fetch(`/api/transactions/${transaction.id}/re-extract`, {
        method: "POST",
        body: formData,
      });
      const d = await res.json();
      if (!res.ok) {
        setReExtractError(d.error || "Re-extraction failed");
        return;
      }
      onTransactionChange?.(d.transaction);
      if (Array.isArray(d.parties)) {
        partiesRef.current = d.parties;
        setParties(d.parties);
      }
      setReExtractSummary({
        filled: d.filled ?? [],
        partiesAdded: d.partiesAdded ?? [],
      });
    } catch {
      setReExtractError("Re-extraction failed");
    } finally {
      setReExtracting(false);
    }
  }

  // Parties handlers — all build off partiesRef.current (the latest snapshot).
  function updateParty(id: string, patch: Partial<TransactionParty>) {
    persistParties(
      partiesRef.current.map((p) => {
        if (p.id !== id) return p;
        const merged = { ...p, ...patch };
        // Auto-fill a Team Steady agent email when the name changes and the
        // email is still blank — kept editable so a TC can override.
        if ("name" in patch && !merged.email) {
          const tsEmail = teamSteadyEmailFor(merged.name);
          if (tsEmail) merged.email = tsEmail;
        }
        return merged;
      })
    );
  }
  function addParty(p?: Omit<TransactionParty, "id">) {
    persistParties([
      ...partiesRef.current,
      makeParty(p ?? { name: "", role: "other", company: "", email: "", phone: "" }),
    ]);
  }
  function removeParty(id: string) {
    persistParties(partiesRef.current.filter((p) => p.id !== id));
  }

  async function handleMarkReviewed() {
    setMarkingReviewed(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged_for_review: false }),
      });
      const d = await res.json();
      if (res.ok && d.transaction) {
        onTransactionChange?.(d.transaction);
      }
    } finally {
      setMarkingReviewed(false);
    }
  }

  async function handleStatusChange(next: PersistedTransactionStatus) {
    setUpdatingStatus(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const d = await res.json();
      if (res.ok && d.transaction) {
        onTransactionChange?.(d.transaction);
      } else {
        setStatusError(d.error || "Could not update transaction status");
      }
    } catch {
      setStatusError("Could not update transaction status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function saveAcceptanceDate(isoDate: string) {
    setSavingAcceptanceDate(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptanceDate: isoDate }),
      });
      const d = await res.json();
      if (res.ok && d.transaction) {
        onTransactionChange?.(d.transaction);
      }
    } finally {
      setSavingAcceptanceDate(false);
    }
  }

  const persistedStatus = resolveStatus(transaction);
  const daysValue =
    persistedStatus === "cancelled"
      ? "Cancelled"
      : persistedStatus === "closed"
        ? "Closed"
        : days == null
          ? "—"
          : days < 0
            ? "Closed"
            : `${days}`;
  const daysSubtitle =
    persistedStatus === "cancelled"
      ? "Transaction cancelled"
      : persistedStatus === "closed" || (days != null && days < 0)
        ? "Transaction closed"
        : days == null
          ? "Closing date TBD"
          : "days to close";
  const needsReview = transaction.flagged_for_review;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ─── 2. Hero header ─── */}
      <section className="rounded-[20px] bg-surface border border-line shadow-card p-6 md:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-stretch md:gap-8">
          {/* Left — price, address, days-to-close pill, worksheet button */}
          <div className="flex flex-col">
            <p className="text-[40px] md:text-[52px] font-semibold tracking-tight text-ink leading-none">
              {formatCurrency(data.purchasePrice)}
            </p>
            <p className="mt-3 text-[15px] text-ink-soft">
              {data.propertyAddress || "Address pending"}
            </p>

            <div className="mt-5 inline-flex w-fit items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-2.5 shadow-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface border border-line shrink-0">
                <Clock className="h-5 w-5 text-brand" strokeWidth={2} />
              </div>
              <div className="leading-tight">
                <p className="text-[22px] font-semibold text-ink tabular-nums leading-none">
                  {daysValue}
                </p>
                <p className="text-[12px] text-ink-mute mt-1">
                  {daysSubtitle}
                </p>
              </div>
            </div>

            <div className="mt-auto pt-7 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    // Open synchronously (avoids pop-up blockers), flush any pending
                    // contact save, then navigate so the worksheet reads fresh data.
                    const w = window.open("", "_blank");
                    await flushParties();
                    if (w) w.location.href = `/transactions/${transaction.id}/worksheet`;
                    else window.open(`/transactions/${transaction.id}/worksheet`, "_blank");
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 h-11 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-hover"
                >
                  <ClipboardList className="h-4 w-4" />
                  Generate Closing Worksheet
                </button>
                {gmailConnected && (
                  <button
                    type="button"
                    disabled={draftingEmail}
                    onClick={() => void handleDraftConnectionEmail()}
                    className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-5 h-11 text-sm font-semibold text-ink-soft shadow-card hover:text-ink hover:border-ink-mute/40 transition-colors disabled:opacity-50"
                  >
                    {draftingEmail ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    Draft Connection Email
                  </button>
                )}
              </div>
              {draftEmailFeedback && (
                <div
                  className={cn(
                    "rounded-xl border px-4 py-2.5 text-sm",
                    draftEmailFeedback.type === "success"
                      ? "border-good bg-good/30 text-good-ink"
                      : "border-danger bg-danger/40 text-danger-ink"
                  )}
                >
                  {draftEmailFeedback.message}
                </div>
              )}
            </div>
          </div>

          {/* Right — photo card */}
          <HeroPhoto
            seed={seed}
            src={propertyImageSrc(photoUrl, data.propertyAddress)}
            status={status}
            mlsValue={mlsValue}
            uploading={uploadingPhoto}
            onMlsChange={setMlsValue}
            onMlsSave={saveMls}
            onUpload={handlePhotoUpload}
          />
        </div>
      </section>

      {/* ─── 4. Deadline tracker ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <InspectionPeriodCard inspectionPeriodDays={data.inspectionPeriodDays} />
        <DeadlineCard
          label="Closing Date"
          date={data.closingDate}
          icon={CheckCircle}
          daysLeft={daysUntil(data.closingDate)}
        />
      </div>

      {/* ─── 5. Transaction Parties + Contacts ─── */}
      <TransactionPartiesSection
        parties={parties}
        dualAgency={dualAgency}
        saving={saving}
        contacts={contacts}
        onUpdate={updateParty}
        onAddParty={addParty}
        onRemove={removeParty}
      />

      {/* ─── 6. Commission Calculator ─── */}
      <CommissionCalculator transaction={transaction} parties={parties} />

      {/* ─── 7. Financials & Contingencies ─── */}
      <div className={cardCls}>
        <div className="px-6 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-ink">Financials &amp; Contingencies</h2>
        </div>

        {(data.earnestMoney || inspectionEndDate) && (
          <div className="grid grid-cols-2 border-b border-line">
            {data.earnestMoney && (
              <div className="p-5 border-r border-line">
                <p className="text-[11px] font-semibold text-ink-mute uppercase tracking-wider">Earnest Money</p>
                <p className="text-2xl font-semibold text-ink mt-1">{formatCurrency(data.earnestMoney)}</p>
                {data.earnestMoneyDueDate && (
                  <p className="text-xs text-ink-mute mt-1">Due {formatDate(data.earnestMoneyDueDate)}</p>
                )}
              </div>
            )}
            {inspectionEndDate && (
              <div className="p-5">
                <p className="text-[11px] font-semibold text-ink-mute uppercase tracking-wider">Inspection Period</p>
                <p className="text-xl font-semibold text-ink mt-1">Ends {formatDate(inspectionEndDate)}</p>
                {inspection && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-line overflow-hidden">
                      <div
                        className="h-full rounded-full bg-good-ink transition-all"
                        style={{ width: `${inspection.percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-ink-mute mt-1">{inspection.label}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="p-6 space-y-0.5">
          <InfoRow label="Purchase price" value={formatCurrency(data.purchasePrice)} />
          <InfoRow
            label="Financing"
            value={
              data.financingType
                ? `${data.financingType.toUpperCase()} · ${formatPercent(data.financingPercentage)}`
                : null
            }
          />
          <EditableDateRow
            label="Acceptance date"
            value={data.acceptanceDate}
            saving={savingAcceptanceDate}
            onSave={saveAcceptanceDate}
          />
          {inspectionLabel && <InfoRow label="Inspection period" value={inspectionLabel} />}
        </div>

        {data.contingencies.length > 0 && (
          <div className="px-6 pb-6">
            <p className="text-[11px] font-semibold text-ink-mute uppercase tracking-wider mb-2">Contingencies</p>
            <ul className="space-y-1.5">
              {data.contingencies.map((c, i) => (
                <li key={i} className="text-sm text-ink-soft flex gap-2">
                  <span className="text-ink-mute">·</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ─── 8. Private Notes ─── */}
      <div className="rounded-[20px] bg-surface border border-line shadow-card p-6">
        <h2 className="text-[15px] font-semibold text-ink mb-3">Private Notes</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add internal notes for your team..."
          rows={4}
          className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand/15 resize-none"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => localStorage.setItem(noteKey, note)}
            className="inline-flex items-center rounded-xl bg-brand px-5 h-10 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Save note
          </button>
        </div>
      </div>

      {/* ─── Extraction notes banner ─── */}
      {(data.errors.length > 0 || dualAgency) && !bannerDismissed && (
        <div
          className={cn(
            "rounded-[20px] px-5 py-4 shadow-card",
            needsReview || dualAgency
              ? "border border-warn bg-warn/45"
              : "bg-surface border border-line"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p
                className={cn(
                  "text-sm font-semibold mb-2",
                  needsReview || dualAgency ? "text-warn-ink" : "text-ink"
                )}
              >
                Extraction notes — review recommended
              </p>
              <ul
                className={cn(
                  "text-sm space-y-1 list-disc list-inside",
                  needsReview || dualAgency ? "text-warn-ink/90" : "text-ink-soft"
                )}
              >
                {dualAgency && (
                  <li key="dual-agency">
                    <strong>Dual agency detected</strong> — the same licensee appears on both sides
                    of this transaction. Confirm role assignment and ensure written consent forms are
                    on file before proceeding.
                  </li>
                )}
                {data.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
              <p
                className={cn(
                  "text-xs mt-2",
                  needsReview || dualAgency ? "text-warn-ink/80" : "text-ink-mute"
                )}
              >
                {(transaction.confidence * 100).toFixed(0)}% extraction confidence
              </p>
              {needsReview && (
                <button
                  type="button"
                  disabled={markingReviewed}
                  onClick={handleMarkReviewed}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 h-10 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  {markingReviewed && <Loader2 className="h-4 w-4 animate-spin" />}
                  Mark as Reviewed
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => { localStorage.setItem(dismissKey, "true"); setBannerDismissed(true); }}
              className={cn(
                "shrink-0 rounded-lg p-1.5 transition-colors",
                needsReview || dualAgency
                  ? "text-warn-ink hover:bg-warn"
                  : "text-ink-mute hover:bg-line/60"
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── 9. Transaction actions ─── */}
      <div className="rounded-[20px] bg-surface border border-line shadow-card p-6">
        <h2 className="text-[15px] font-semibold text-ink mb-1">Transaction actions</h2>
        <p className="text-sm text-ink-soft mb-5">
          Update status, upload a revised purchase agreement to fill in missing fields, or
          permanently remove this transaction.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-line">
          {statusError && (
            <p className="w-full text-sm text-danger-ink">{statusError}</p>
          )}
          {persistedStatus === "active" && (
            <>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => void handleStatusChange("closed")}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-5 h-11 text-sm font-semibold text-ink-soft shadow-card hover:text-ink hover:border-ink-mute/40 transition-colors disabled:opacity-50"
              >
                {updatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark as Closed
              </button>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => void handleStatusChange("cancelled")}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-5 h-11 text-sm font-semibold text-ink-soft shadow-card hover:text-ink hover:border-ink-mute/40 transition-colors disabled:opacity-50"
              >
                Mark as Cancelled
              </button>
            </>
          )}
          {persistedStatus === "closed" && (
            <>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => void handleStatusChange("active")}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-5 h-11 text-sm font-semibold text-ink-soft shadow-card hover:text-ink hover:border-ink-mute/40 transition-colors disabled:opacity-50"
              >
                {updatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark as Active
              </button>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => void handleStatusChange("cancelled")}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-5 h-11 text-sm font-semibold text-ink-soft shadow-card hover:text-ink hover:border-ink-mute/40 transition-colors disabled:opacity-50"
              >
                Mark as Cancelled
              </button>
            </>
          )}
          {persistedStatus === "cancelled" && (
            <button
              type="button"
              disabled={updatingStatus}
              onClick={() => void handleStatusChange("active")}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-5 h-11 text-sm font-semibold text-ink-soft shadow-card hover:text-ink hover:border-ink-mute/40 transition-colors disabled:opacity-50"
            >
              {updatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
              Mark as Active
            </button>
          )}
        </div>

        {reExtractSummary !== null && (
          <div className="mb-5 rounded-xl border border-good bg-good/30 px-4 py-3">
            <p className="text-sm font-semibold text-good-ink">
              Saved successfully
            </p>
            {(() => {
              const total =
                reExtractSummary.filled.length + reExtractSummary.partiesAdded.length;
              if (total === 0) {
                return (
                  <p className="mt-1 text-sm text-good-ink/90">
                    No new fields or contacts to add — everything was already populated.
                  </p>
                );
              }
              return (
                <p className="mt-1 text-sm text-good-ink/90">
                  {total} new item{total === 1 ? "" : "s"} added to this transaction.
                </p>
              );
            })()}
            {reExtractSummary.filled.length > 0 && (
              <ul className="mt-2 space-y-1">
                {reExtractSummary.filled.map((f) => (
                  <li key={f.field} className="text-sm text-good-ink/90">
                    <span className="font-medium">{f.label}:</span>{" "}
                    <span className="text-good-ink/80">{f.value}</span>
                  </li>
                ))}
              </ul>
            )}
            {reExtractSummary.partiesAdded.length > 0 && (
              <ul className="mt-2 space-y-1">
                {reExtractSummary.partiesAdded.map((p) => (
                  <li key={`${p.label}-${p.name}`} className="text-sm text-good-ink/90">
                    <span className="font-medium">{p.label}:</span>{" "}
                    <span className="text-good-ink/80">{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setReExtractSummary(null)}
              className="mt-2 text-xs font-medium text-good-ink/70 hover:text-good-ink"
            >
              Dismiss
            </button>
          </div>
        )}

        {reExtractError && (
          <div className="mb-5 rounded-xl border border-danger bg-danger/40 px-4 py-3 text-sm text-danger-ink">
            {reExtractError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={paInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleReExtract}
          />
          <button
            type="button"
            disabled={reExtracting}
            onClick={() => paInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-4 h-10 text-sm font-semibold text-ink-soft hover:text-ink hover:border-ink-mute/40 transition-colors disabled:opacity-50"
          >
            {reExtracting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            Upload new PA
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-danger/50 bg-danger/20 px-4 h-10 text-sm font-semibold text-danger-ink hover:bg-danger/35 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete transaction
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-mute">
          Re-extraction only fills blank fields — existing data and your manual edits
          in Transaction Contacts are never overwritten.
        </p>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="w-full max-w-md rounded-[20px] bg-surface border border-line shadow-card p-6"
          >
            <h3 id="delete-dialog-title" className="text-[17px] font-semibold text-ink">
              Delete this transaction?
            </h3>
            <p className="mt-2 text-sm text-ink-soft">
              This cannot be undone. All contacts, commission data, and worksheet
              information for this transaction will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="inline-flex items-center rounded-xl border border-line px-4 h-10 text-sm font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="inline-flex items-center gap-2 rounded-xl bg-danger-ink px-4 h-10 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
