import {
  migrateDataUrlToStorage,
  savePropertyPhotoForTransaction,
} from "@/lib/property-photo-storage";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("photo");
      if (!(file instanceof File) || file.size === 0) {
        return Response.json({ error: "Missing photo file" }, { status: 400 });
      }
      if (!file.type.startsWith("image/")) {
        return Response.json({ error: "Upload an image file" }, { status: 400 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const { publicUrl, path } = await savePropertyPhotoForTransaction(
        id,
        bytes,
        file.type
      );
      return Response.json({ success: true, url: publicUrl, path });
    }

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as { dataUrl?: string };
      if (!body.dataUrl?.trim()) {
        return Response.json({ error: "Missing dataUrl" }, { status: 400 });
      }
      const result = await migrateDataUrlToStorage(id, body.dataUrl.trim());
      if (!result) {
        return Response.json({ error: "Invalid image data" }, { status: 400 });
      }
      return Response.json({ success: true, url: result.publicUrl, path: result.path });
    }

    return Response.json(
      { error: "Use multipart form (photo) or JSON { dataUrl }" },
      { status: 400 }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
