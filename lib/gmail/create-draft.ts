import type { OAuth2Client } from "google-auth-library";
import type { OpeningEmailDraft } from "@/lib/gmail/draft-email";

export type GmailAttachment = {
  filename: string;
  data: Buffer;
  mimeType?: string;
};

/** Wrap base64 at 76 characters per line as required by MIME spec. */
function wrapBase64(b64: string): string {
  return b64.match(/.{1,76}/g)?.join("\r\n") ?? b64;
}

/** Convert plain-text email body to basic HTML paragraphs. */
function textToHtml(body: string): string {
  return body
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function encodeSimpleMime(draft: OpeningEmailDraft): string {
  const headers = [
    draft.to.length > 0 ? `To: ${draft.to.join(", ")}` : null,
    draft.cc.length > 0 ? `Cc: ${draft.cc.join(", ")}` : null,
    `Subject: ${draft.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ].filter(Boolean) as string[];

  const raw = `${headers.join("\r\n")}\r\n\r\n${draft.body}`;
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * multipart/alternative — text/plain + text/html with the Gmail signature
 * appended to the HTML part. Mail clients that support HTML will show the
 * formatted version with the signature; plain-text clients fall back cleanly.
 */
function encodeAlternativeMime(
  draft: OpeningEmailDraft,
  htmlSignature: string
): string {
  const boundary = "==Handled_Alt_Boundary==";

  const headers = [
    draft.to.length > 0 ? `To: ${draft.to.join(", ")}` : null,
    draft.cc.length > 0 ? `Cc: ${draft.cc.join(", ")}` : null,
    `Subject: ${draft.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean) as string[];

  const htmlBody = `${draft.htmlBody ?? textToHtml(draft.body)}<br><br>${htmlSignature}`;

  const textPart = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    draft.body,
  ].join("\r\n");

  const htmlPart = [
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
  ].join("\r\n");

  const raw = [
    headers.join("\r\n"),
    "",
    textPart,
    htmlPart,
    `--${boundary}--`,
  ].join("\r\n");

  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeMultipartMime(
  draft: OpeningEmailDraft,
  attachments: GmailAttachment[]
): string {
  const boundary = "==Handled_CW_Boundary==";

  const headers = [
    draft.to.length > 0 ? `To: ${draft.to.join(", ")}` : null,
    draft.cc.length > 0 ? `Cc: ${draft.cc.join(", ")}` : null,
    `Subject: ${draft.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean) as string[];

  const textPart = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    draft.body,
  ].join("\r\n");

  const attachParts = attachments.map((att) => {
    const mime = att.mimeType ?? "application/pdf";
    const b64 = wrapBase64(att.data.toString("base64"));
    return [
      `--${boundary}`,
      `Content-Type: ${mime}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      b64,
    ].join("\r\n");
  });

  const raw = [
    headers.join("\r\n"),
    "",
    textPart,
    ...attachParts,
    `--${boundary}--`,
  ].join("\r\n");

  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createGmailDraft(
  client: OAuth2Client,
  draft: OpeningEmailDraft,
  attachments?: GmailAttachment[],
  htmlSignature?: string
): Promise<void> {
  let raw: string;
  if (attachments?.length) {
    raw = encodeMultipartMime(draft, attachments);
  } else if (htmlSignature) {
    raw = encodeAlternativeMime(draft, htmlSignature);
  } else {
    raw = encodeSimpleMime(draft);
  }

  await client.request({
    url: "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    method: "POST",
    data: { message: { raw } },
  });
}
