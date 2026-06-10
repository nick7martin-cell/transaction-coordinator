"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Contact } from "@/lib/types";
import { cn } from "@/lib/utils";

type ContactType = "lender" | "title";

const TYPE_LABELS: Record<ContactType, string> = {
  title: "Title Companies",
  lender: "Lenders",
};

interface ContactFormState {
  type: ContactType;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
}

const EMPTY_FORM: ContactFormState = {
  type: "lender",
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
};

function ContactRow({
  contact,
  onSave,
  onDelete,
}: {
  contact: Contact;
  onSave: (id: string, data: Omit<ContactFormState, "type">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    company_name: contact.company_name,
    contact_name: contact.contact_name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(contact.id, form);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="bg-slate-50/80">
        <td className="px-4 py-3">
          <input
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder="Company name"
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={form.contact_name}
            onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder="Contact name"
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder="email@example.com"
            type="email"
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder="(000) 000-0000"
          />
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="default"
              onClick={handleSave}
              disabled={saving}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-slate-50/50 group">
      <td className="px-4 py-3 text-sm font-medium text-slate-900">{contact.company_name}</td>
      <td className="px-4 py-3 text-sm text-slate-700">{contact.contact_name}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{contact.email || <span className="text-slate-400">—</span>}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{contact.phone || <span className="text-slate-400">—</span>}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => onDelete(contact.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function AddRow({
  defaultType,
  onAdd,
  onCancel,
}: {
  defaultType: ContactType;
  onAdd: (data: ContactFormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ContactFormState>({ ...EMPTY_FORM, type: defaultType });
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!form.company_name || !form.contact_name) return;
    setSaving(true);
    await onAdd(form);
    setSaving(false);
  }

  return (
    <tr className="bg-slate-50">
      <td className="px-4 py-3">
        <input
          autoFocus
          value={form.company_name}
          onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          placeholder="Company name *"
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={form.contact_name}
          onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          placeholder="Contact name *"
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          placeholder="Email"
          type="email"
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          placeholder="Phone"
        />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={saving || !form.company_name || !form.contact_name}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </td>
    </tr>
  );
}

function ContactsTable({
  type,
  contacts,
  onSave,
  onDelete,
  onAdd,
}: {
  type: ContactType;
  contacts: Contact[];
  onSave: (id: string, data: Omit<ContactFormState, "type">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAdd: (data: ContactFormState) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200/80 overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50/80 px-5 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">{TYPE_LABELS[type]}</h3>
          <span className="text-xs text-slate-400">({contacts.length})</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-1/4">Company</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-1/4">Contact</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-1/4">Email</th>
              <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Phone</th>
              <th className="px-4 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {contacts.map((c) => (
              <ContactRow key={c.id} contact={c} onSave={onSave} onDelete={onDelete} />
            ))}
            {adding && (
              <AddRow
                defaultType={type}
                onAdd={async (data) => {
                  await onAdd(data);
                  setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            )}
            {!contacts.length && !adding && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  No {TYPE_LABELS[type].toLowerCase()} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ContactsSection() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [showSeedBanner, setShowSeedBanner] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/contacts");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load contacts"); return; }
      setContacts(data.contacts ?? []);
      setShowSeedBanner((data.contacts ?? []).length === 0);
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function seedDefaults() {
    setSeeding(true);
    await fetch("/api/contacts", { method: "PUT" });
    await load();
    setSeeding(false);
  }

  async function handleAdd(form: ContactFormState) {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) await load();
  }

  async function handleSave(id: string, data: Omit<ContactFormState, "type">) {
    const contact = contacts.find((c) => c.id === id);
    if (!contact) return;
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, type: contact.type }),
    });
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this contact?")) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    await load();
  }

  const lenders = contacts.filter((c) => c.type === "lender");
  const titles = contacts.filter((c) => c.type === "title");

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">Preferred Contacts</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Lenders and title companies available in transaction dropdowns.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error} — make sure you've run <code className="font-mono">supabase-setup.sql</code>
          </div>
        )}
        {showSeedBanner && !loading && (
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">
              No contacts found. Load the default lenders and title companies?
            </p>
            <Button
              size="sm"
              onClick={seedDefaults}
              disabled={seeding}
              className="bg-amber-800 text-white hover:bg-amber-900 ml-4 shrink-0"
            >
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load defaults"}
            </Button>
          </div>
        )}

        {!loading && !error && (
          <>
            <ContactsTable
              type="title"
              contacts={titles}
              onAdd={handleAdd}
              onSave={handleSave}
              onDelete={handleDelete}
            />
            <ContactsTable
              type="lender"
              contacts={lenders}
              onAdd={handleAdd}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          </>
        )}
      </div>
    </section>
  );
}
