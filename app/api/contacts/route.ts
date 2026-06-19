import { INGRID_WATERMARK_EMAIL, normalizeContact } from "@/lib/canonical-contacts";
import { supabase } from "@/lib/supabase";
import type { Contact } from "@/lib/types";

const DEFAULT_CONTACTS = [
  { type: "title",  company_name: "Watermark Title",    contact_name: "Ingrid Bredeson", email: INGRID_WATERMARK_EMAIL,          phone: "(763) 972-4523" },
  { type: "title",  company_name: "All American Title",  contact_name: "Lacey Rentz",     email: "lrentz@allamericantitleco.com", phone: "(763) 710-8645" },
  { type: "lender", company_name: "Fairway Mortgage",   contact_name: "Brett Reinhart",  email: "brett.reinhart@fairwaymc.com", phone: "(952) 738-1178" },
  { type: "lender", company_name: "Edge Home Finance",  contact_name: "Josh Little",     email: "josh@loansbylittle.com",       phone: "(507) 210-7227" },
] as const;

export async function GET() {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("type")
    .order("company_name");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const raw = (data ?? []) as Contact[];
  const contacts = raw.map(normalizeContact);

  for (let i = 0; i < raw.length; i++) {
    const fixed = contacts[i];
    if (fixed.email !== (raw[i].email ?? "")) {
      await supabase
        .from("contacts")
        .update({ email: fixed.email })
        .eq("id", raw[i].id);
    }
  }

  return Response.json({ contacts });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { type, company_name, contact_name, email, phone } = body;

  if (!type || !company_name || !contact_name) {
    return Response.json({ error: "type, company_name, and contact_name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({ type, company_name, contact_name, email: email || null, phone: phone || null })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ contact: data as Contact });
}

// Seeds default contacts if none exist
export async function PUT() {
  const { data: existing } = await supabase.from("contacts").select("id").limit(1);
  if (existing && existing.length > 0) {
    return Response.json({ message: "Contacts already exist — no seed needed" });
  }

  const { data, error } = await supabase.from("contacts").insert(DEFAULT_CONTACTS).select();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ contacts: data as Contact[], seeded: true });
}
