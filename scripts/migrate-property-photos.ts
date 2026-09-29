/**
 * One-time: move worksheet propertyPhotoUrl data URLs into Supabase Storage.
 * Run supabase-property-photos.sql first, then:
 *   npx tsx scripts/migrate-property-photos.ts
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  isEmbeddedPropertyPhoto,
  migrateDataUrlToStorage,
  publicPropertyPhotoUrl,
} from "../lib/property-photo-storage";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: rows, error } = await supabase
    .from("transaction_meta")
    .select("transaction_id, property_photo_path, worksheet");

  if (error) {
    console.error("Fetch failed:", error.message);
    console.error("Did you run supabase-property-photos.sql?");
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const id = row.transaction_id as string;
    if (row.property_photo_path) {
      skipped++;
      continue;
    }
    const ws = (row.worksheet ?? {}) as Record<string, unknown>;
    const photo = ws.propertyPhotoUrl;
    if (!isEmbeddedPropertyPhoto(photo)) {
      skipped++;
      continue;
    }

    process.stdout.write(`Migrating ${id}… `);
    try {
      const result = await migrateDataUrlToStorage(id, photo);
      if (result) {
        console.log(publicPropertyPhotoUrl(result.path));
        migrated++;
      } else {
        console.log("skip (invalid data)");
        skipped++;
      }
    } catch (e) {
      console.log("FAILED", e instanceof Error ? e.message : e);
      failed++;
    }
  }

  console.log(`Done. migrated=${migrated} skipped=${skipped} failed=${failed}`);
}

main();
