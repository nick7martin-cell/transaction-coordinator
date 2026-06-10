import type { ExtractionDocument } from "@/lib/extract-pdf";

type ImageMediaType = Extract<
  ExtractionDocument,
  { kind: "image" }
>["mediaType"];

const IMAGE_MEDIA: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

const IMAGE_EXT: Record<string, ImageMediaType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

export function isImageFile(file: File): boolean {
  if (IMAGE_MEDIA[file.type as keyof typeof IMAGE_MEDIA]) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext in IMAGE_EXT;
}

export function isAllowedUploadFile(file: File): boolean {
  return isPdfFile(file) || isImageFile(file);
}

export function imageMediaType(file: File): ImageMediaType | null {
  if (IMAGE_MEDIA[file.type as keyof typeof IMAGE_MEDIA]) {
    return IMAGE_MEDIA[file.type as keyof typeof IMAGE_MEDIA];
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXT[ext] ?? null;
}

export function countPdfFiles(files: File[]): number {
  return files.filter(isPdfFile).length;
}

export async function filesToExtractionDocuments(
  files: File[]
): Promise<ExtractionDocument[]> {
  const documents: ExtractionDocument[] = [];

  for (const file of files) {
    if (isPdfFile(file)) {
      documents.push({
        kind: "pdf",
        buffer: await file.arrayBuffer(),
        mediaType: "application/pdf",
      });
      continue;
    }

    const mediaType = imageMediaType(file);
    if (!mediaType) continue;

    documents.push({
      kind: "image",
      buffer: await file.arrayBuffer(),
      mediaType,
    });
  }

  return documents;
}

export function primaryFileName(files: File[]): string {
  const pdf = files.find(isPdfFile);
  return pdf?.name ?? files[0]?.name ?? "upload";
}
