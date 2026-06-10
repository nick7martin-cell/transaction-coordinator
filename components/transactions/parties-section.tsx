"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Mail, Phone, Plus, Trash2, UserPlus } from "lucide-react";
import { getAvatarColor, getInitials } from "@/lib/property-image";
import {
  PARTY_ROLE_OPTIONS,
  type Contact,
  type PartyRole,
  type TransactionParty,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type NewParty = Omit<TransactionParty, "id">;

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const color = getAvatarColor(name || "?");
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-semibold shrink-0",
        color
      )}
      style={{ width: size, height: size, fontSize: size <= 32 ? 11 : 13 }}
    >
      {getInitials(name || "?")}
    </div>
  );
}

// ── Inline editable text ──────────────────────────────────────────────────────
// Empty → shows an input. Filled → text that turns into an input on click.

function InlineText({
  value,
  placeholder,
  onSave,
  type = "text",
  className,
  inputClassName,
}: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  type?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (local !== value) onSave(local);
  }

  if (editing || !value) {
    return (
      <input
        ref={ref}
        type={type}
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") ref.current?.blur();
          if (e.key === "Escape") { setLocal(value); setEditing(false); }
        }}
        className={cn(
          "w-full min-w-0 rounded-md border bg-transparent px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand/15",
          editing ? "border-brand/40" : "border-dashed border-line hover:border-ink-mute/40",
          "placeholder:text-ink-mute/60",
          inputClassName ?? className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={cn(
        "text-left rounded-md px-1 -mx-1 hover:bg-line/50 transition-colors truncate max-w-full",
        className
      )}
    >
      {value}
    </button>
  );
}

// ── Principals card (Buyers + Sellers) ────────────────────────────────────────

function PrincipalRow({
  party,
  label,
  onUpdate,
}: {
  party: TransactionParty;
  label: string;
  onUpdate: (id: string, patch: Partial<TransactionParty>) => void;
}) {
  return (
    <div>
      <p className="text-[12px] text-ink-soft">{label}</p>
      <InlineText
        value={party.name}
        placeholder={`${label} name`}
        onSave={(v) => onUpdate(party.id, { name: v })}
        className="text-[17px] font-semibold text-ink"
        inputClassName="text-[17px] font-semibold text-ink"
      />
      <div className="mt-1 space-y-0.5">
        <span className="flex items-center gap-1.5 text-sm text-ink-soft">
          <Mail className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
          <InlineText
            value={party.email}
            placeholder="Email"
            type="email"
            onSave={(v) => onUpdate(party.id, { email: v })}
            className="text-sm text-ink-soft"
            inputClassName="text-sm text-ink-soft"
          />
        </span>
        <span className="flex items-center gap-1.5 text-sm text-ink-soft">
          <Phone className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
          <InlineText
            value={party.phone}
            placeholder="Phone"
            onSave={(v) => onUpdate(party.id, { phone: v })}
            className="text-sm text-ink-soft"
            inputClassName="text-sm text-ink-soft"
          />
        </span>
      </div>
    </div>
  );
}

function PrincipalsCard({
  parties,
  onUpdate,
}: {
  parties: TransactionParty[];
  onUpdate: (id: string, patch: Partial<TransactionParty>) => void;
}) {
  const buyers = parties.filter((p) => p.role === "buyer");
  const sellers = parties.filter((p) => p.role === "seller");

  return (
    <div className="rounded-[20px] bg-surface border border-line shadow-card p-6">
      <h3 className="text-[15px] font-semibold text-ink pb-3 mb-4 border-b border-line">
        Principals
      </h3>
      <div className="space-y-5">
        {buyers.length === 0 && sellers.length === 0 && (
          <p className="text-sm text-ink-mute">No principals yet — add them below.</p>
        )}
        {buyers.map((p, i) => (
          <PrincipalRow
            key={p.id}
            party={p}
            label={buyers.length > 1 ? `Buyer ${i + 1}` : "Buyer"}
            onUpdate={onUpdate}
          />
        ))}
        {sellers.map((p, i) => (
          <PrincipalRow
            key={p.id}
            party={p}
            label={sellers.length > 1 ? `Seller ${i + 1}` : "Seller"}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  );
}

// ── Agents card ───────────────────────────────────────────────────────────────

function AgentRow({
  party,
  defaultLabel,
  onUpdate,
}: {
  party: TransactionParty;
  defaultLabel: string;
  onUpdate: (id: string, patch: Partial<TransactionParty>) => void;
}) {
  const unconfirmed = party.role === "agent_unconfirmed";
  return (
    <div className="flex items-start gap-3">
      <Avatar name={party.name} size={42} />
      <div className="min-w-0 flex-1">
        {unconfirmed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn px-2 py-0.5 text-[11px] font-semibold text-warn-ink">
            Needs Confirmation
          </span>
        ) : (
          <p className="text-[12px] text-ink-soft">{defaultLabel}</p>
        )}
        <InlineText
          value={party.name}
          placeholder="Agent name"
          onSave={(v) => onUpdate(party.id, { name: v })}
          className="text-[16px] font-semibold text-ink"
          inputClassName="text-[16px] font-semibold text-ink"
        />
        <InlineText
          value={party.company}
          placeholder="Brokerage"
          onSave={(v) => onUpdate(party.id, { company: v })}
          className="text-sm text-ink-soft block"
          inputClassName="text-sm text-ink-soft"
        />
      </div>
    </div>
  );
}

function AgentsCard({
  parties,
  dualAgency,
  onUpdate,
}: {
  parties: TransactionParty[];
  dualAgency: boolean;
  onUpdate: (id: string, patch: Partial<TransactionParty>) => void;
}) {
  const agents = parties.filter(
    (p) => p.role === "buyer_agent" || p.role === "listing_agent" || p.role === "agent_unconfirmed"
  );

  return (
    <div className="rounded-[20px] bg-surface border border-line shadow-card p-6">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-line">
        <h3 className="text-[15px] font-semibold text-ink">Agents</h3>
        {dualAgency && (
          <span className="rounded-full bg-warn px-2 py-0.5 text-[11px] font-semibold text-warn-ink">
            Dual agency
          </span>
        )}
      </div>
      <div className="space-y-5">
        {agents.length === 0 && (
          <p className="text-sm text-ink-mute">No agents yet — add them below.</p>
        )}
        {agents.map((p) => (
          <AgentRow
            key={p.id}
            party={p}
            defaultLabel={p.role === "listing_agent" ? "Listing Agent" : "Buyer's Agent"}
            onUpdate={onUpdate}
          />
        ))}
        {dualAgency && agents.some((a) => a.role === "agent_unconfirmed") && (
          <p className="text-xs text-ink-mute leading-relaxed">
            Same brokerage on both sides. Assign each agent&apos;s role using the
            dropdown in the contacts list below.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Contacts list (full editable roster) ──────────────────────────────────────

const fieldCls =
  "w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand/15";

function ContactListRow({
  party,
  onUpdate,
  onRemove,
}: {
  party: TransactionParty;
  onUpdate: (id: string, patch: Partial<TransactionParty>) => void;
  onRemove: (id: string) => void;
}) {
  const roleValue: PartyRole =
    party.role === "agent_unconfirmed" ? "agent_unconfirmed" : party.role;

  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <Avatar name={party.name} size={40} />

      <div className="grid flex-1 min-w-0 gap-2 md:grid-cols-2">
        {/* Name + role */}
        <div className="space-y-2">
          <input
            defaultValue={party.name}
            placeholder="Full name"
            onBlur={(e) => { if (e.target.value !== party.name) onUpdate(party.id, { name: e.target.value }); }}
            className={cn(fieldCls, "font-semibold")}
          />
          <select
            value={roleValue}
            onChange={(e) => onUpdate(party.id, { role: e.target.value as PartyRole })}
            className={fieldCls}
          >
            {party.role === "agent_unconfirmed" && (
              <option value="agent_unconfirmed">⚠ Needs Confirmation</option>
            )}
            {PARTY_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Company + email + phone */}
        <div className="space-y-2">
          <input
            defaultValue={party.company}
            placeholder="Company / brokerage"
            onBlur={(e) => { if (e.target.value !== party.company) onUpdate(party.id, { company: e.target.value }); }}
            className={fieldCls}
          />
          <div className="flex gap-2">
            <input
              defaultValue={party.email}
              placeholder="Email"
              type="email"
              onBlur={(e) => { if (e.target.value !== party.email) onUpdate(party.id, { email: e.target.value }); }}
              className={fieldCls}
            />
            <input
              defaultValue={party.phone}
              placeholder="Phone"
              onBlur={(e) => { if (e.target.value !== party.phone) onUpdate(party.id, { phone: e.target.value }); }}
              className={fieldCls}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(party.id)}
        title="Remove contact"
        className="shrink-0 rounded-lg p-2 text-ink-mute hover:bg-danger/40 hover:text-danger-ink transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Add-contact controls (saved picker + manual form + quick-select) ──────────

const controlCls =
  "rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/15";

function defaultRoleForContact(c: Contact): PartyRole {
  return c.type === "lender" ? "lender" : "buyer_title";
}

function SavedPicker({
  contacts,
  onPick,
}: {
  contacts: Contact[];
  onPick: (p: NewParty) => void;
}) {
  const [sel, setSel] = useState("");
  const lenders = contacts.filter((c) => c.type === "lender");
  const titles = contacts.filter((c) => c.type === "title");
  const chosen = contacts.find((c) => c.id === sel) ?? null;

  function add() {
    if (!chosen) return;
    onPick({
      name: chosen.contact_name,
      role: defaultRoleForContact(chosen),
      company: chosen.company_name,
      email: chosen.email ?? "",
      phone: chosen.phone ?? "",
    });
  }

  if (contacts.length === 0) {
    return <p className="text-sm text-ink-mute">No saved contacts yet. Add some in Settings.</p>;
  }

  return (
    <div className="space-y-3">
      <select value={sel} onChange={(e) => setSel(e.target.value)} className={cn(controlCls, "w-full")}>
        <option value="">— Select a saved contact —</option>
        {lenders.length > 0 && (
          <optgroup label="Lenders">
            {lenders.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name} · {c.contact_name}</option>
            ))}
          </optgroup>
        )}
        {titles.length > 0 && (
          <optgroup label="Title companies">
            {titles.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name} · {c.contact_name}</option>
            ))}
          </optgroup>
        )}
      </select>

      {chosen && (
        <div className="rounded-lg bg-canvas border border-line px-3 py-2 text-xs text-ink-soft space-y-0.5">
          <p className="font-medium text-ink">{chosen.contact_name} · {chosen.company_name}</p>
          {chosen.email && <p>{chosen.email}</p>}
          {chosen.phone && <p>{chosen.phone}</p>}
          <p className="text-ink-mute">
            Adds as {chosen.type === "lender" ? "Lender" : "Buyer's Title Company"} — change the role after adding if needed.
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={!chosen}
        onClick={add}
        className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 h-10 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50 disabled:pointer-events-none"
      >
        <Plus className="h-4 w-4" />
        Add to transaction
      </button>
    </div>
  );
}

function ManualForm({ onAdd }: { onAdd: (p: NewParty) => void }) {
  const [f, setF] = useState<NewParty>({ name: "", role: "other", company: "", email: "", phone: "" });
  const canAdd = f.name.trim() !== "" || f.company.trim() !== "";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder="Full name"
          className={cn(controlCls, "w-full")}
        />
        <select
          value={f.role}
          onChange={(e) => setF({ ...f, role: e.target.value as PartyRole })}
          className={cn(controlCls, "w-full")}
        >
          {PARTY_ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          value={f.company}
          onChange={(e) => setF({ ...f, company: e.target.value })}
          placeholder="Company / brokerage"
          className={cn(controlCls, "w-full")}
        />
        <input
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          placeholder="Email"
          type="email"
          className={cn(controlCls, "w-full")}
        />
        <input
          value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
          placeholder="Phone"
          className={cn(controlCls, "w-full")}
        />
      </div>
      <button
        type="button"
        disabled={!canAdd}
        onClick={() => onAdd(f)}
        className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 h-10 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50 disabled:pointer-events-none"
      >
        <Plus className="h-4 w-4" />
        Add contact
      </button>
    </div>
  );
}

function AddContactControls({
  contacts,
  onAddParty,
}: {
  contacts: Contact[];
  onAddParty: (p: NewParty) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"saved" | "manual">("saved");

  const lenders = contacts.filter((c) => c.type === "lender");
  const titles = contacts.filter((c) => c.type === "title");

  function quickAdd(c: Contact, role: PartyRole) {
    onAddParty({
      name: c.contact_name,
      role,
      company: c.company_name,
      email: c.email ?? "",
      phone: c.phone ?? "",
    });
  }

  return (
    <div className="space-y-3">
      {/* Always-visible quick-select from saved lenders / title companies */}
      {(lenders.length > 0 || titles.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-mute">Quick add from saved:</span>
          {lenders.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const c = lenders.find((x) => x.id === e.target.value);
                if (c) quickAdd(c, "lender");
                e.currentTarget.value = "";
              }}
              className={controlCls}
            >
              <option value="">+ Lender…</option>
              {lenders.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name} · {c.contact_name}</option>
              ))}
            </select>
          )}
          {titles.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const c = titles.find((x) => x.id === e.target.value);
                if (c) quickAdd(c, "buyer_title");
                e.currentTarget.value = "";
              }}
              className={controlCls}
            >
              <option value="">+ Title company…</option>
              {titles.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name} · {c.contact_name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setMode("saved"); }}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-4 h-10 text-sm font-semibold text-ink-soft hover:text-ink hover:border-ink-mute/40 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add contact
        </button>
      ) : (
        <div className="rounded-xl border border-line bg-canvas p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("saved")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mode === "saved" ? "bg-brand text-white" : "text-ink-soft hover:bg-line/60"
              )}
            >
              <Building2 className="h-4 w-4" />
              Pick from saved contacts
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mode === "manual" ? "bg-brand text-white" : "text-ink-soft hover:bg-line/60"
              )}
            >
              <UserPlus className="h-4 w-4" />
              Enter manually
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-xs font-medium text-ink-mute hover:text-ink"
            >
              Cancel
            </button>
          </div>

          {mode === "saved" ? (
            <SavedPicker
              contacts={contacts}
              onPick={(p) => { onAddParty(p); setOpen(false); }}
            />
          ) : (
            <ManualForm onAdd={(p) => { onAddParty(p); setOpen(false); }} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function TransactionPartiesSection({
  parties,
  dualAgency,
  saving,
  contacts,
  onUpdate,
  onAddParty,
  onRemove,
}: {
  parties: TransactionParty[];
  dualAgency: boolean;
  saving: boolean;
  contacts: Contact[];
  onUpdate: (id: string, patch: Partial<TransactionParty>) => void;
  onAddParty: (p: NewParty) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Transaction Parties */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[18px] font-semibold text-ink tracking-tight">
            Transaction Parties
          </h2>
          {saving && <span className="text-xs text-ink-mute animate-pulse">Saving…</span>}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PrincipalsCard parties={parties} onUpdate={onUpdate} />
          <AgentsCard parties={parties} dualAgency={dualAgency} onUpdate={onUpdate} />
        </div>
      </section>

      {/* Transaction Contacts */}
      <section className="rounded-[20px] bg-surface border border-line shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Transaction Contacts</h2>
            <p className="text-xs text-ink-mute mt-0.5">
              Change any role from the dropdown — edits save automatically.
            </p>
          </div>
        </div>

        <div className="divide-y divide-line/70">
          {parties.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-ink-mute">
              No contacts yet.
            </div>
          ) : (
            parties.map((p) => (
              <ContactListRow
                key={p.id}
                party={p}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ))
          )}
        </div>

        <div className="border-t border-line p-4">
          <AddContactControls contacts={contacts} onAddParty={onAddParty} />
        </div>
      </section>
    </div>
  );
}
