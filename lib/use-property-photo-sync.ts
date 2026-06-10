"use client";

import { useEffect } from "react";
import { PROPERTY_PHOTO_UPDATED } from "@/lib/property-image";
import type { Transaction } from "@/lib/types";

/** Keep transaction lists in sync when a custom photo is uploaded on the detail page. */
export function usePropertyPhotoSync(
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>
) {
  useEffect(() => {
    function onPhoto(e: Event) {
      const { transactionId, photoUrl } = (
        e as CustomEvent<{ transactionId: string; photoUrl: string }>
      ).detail;
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === transactionId ? { ...t, propertyPhotoUrl: photoUrl } : t
        )
      );
    }
    window.addEventListener(PROPERTY_PHOTO_UPDATED, onPhoto);
    return () => window.removeEventListener(PROPERTY_PHOTO_UPDATED, onPhoto);
  }, [setTransactions]);
}
