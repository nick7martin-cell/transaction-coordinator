"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";

export function GmailSection() {
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/google/status");
      const data = await res.json();
      setConnected(!!data.connected);
      setEmail(data.email ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const gmail = searchParams.get("gmail");
    if (gmail === "connected") {
      const connectedEmail = searchParams.get("email");
      setBanner(
        connectedEmail
          ? `Gmail connected as ${connectedEmail}.`
          : "Gmail connected successfully."
      );
      void loadStatus();
    } else if (gmail === "error") {
      setBanner("Gmail connection failed. Please try again.");
    }
  }, [searchParams, loadStatus]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Gmail</h2>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Connect Google to automatically create opening email drafts when a new
          transaction is uploaded.
        </p>
      </div>

      <div className="px-6 py-5">
        {banner && (
          <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {banner}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking connection…
          </div>
        ) : connected ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Connected</p>
              <p className="text-sm text-slate-500 mt-0.5">{email}</p>
            </div>
            <a
              href="/api/auth/google"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 h-10 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Reconnect Gmail
            </a>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-slate-600">
              No Gmail account connected. Drafts will not be created until you
              connect.
            </p>
            <a
              href="/api/auth/google"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 h-10 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shrink-0"
            >
              Connect Gmail
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
