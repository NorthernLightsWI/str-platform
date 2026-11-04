import { createClient } from "@/lib/supabase/client"

const MAX_LONG_SIDE      = 1600
const JPEG_QUALITY       = 0.80
const COMPRESS_THRESHOLD = 100 * 1024    // skip compression for tiny files
const UPLOAD_TIMEOUT_MS  = 30_000

// Resize to MAX_LONG_SIDE px on the longest edge and re-encode as JPEG.
// Honors EXIF orientation via createImageBitmap({ imageOrientation: "from-image" }).
// Files under 100 KB are returned as-is to skip the round-trip through canvas.
export async function compressImage(file: File): Promise<Blob> {
  if (file.size <= COMPRESS_THRESHOLD) return file

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  const { width: w, height: h } = bitmap

  let targetW = w, targetH = h
  if (w > MAX_LONG_SIDE || h > MAX_LONG_SIDE) {
    const ratio = Math.min(MAX_LONG_SIDE / w, MAX_LONG_SIDE / h)
    targetW = Math.round(w * ratio)
    targetH = Math.round(h * ratio)
  }

  const canvas = document.createElement("canvas")
  canvas.width  = targetW
  canvas.height = targetH
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.drawImage(bitmap, 0, 0, targetW, targetH)
  bitmap.close()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("Image compression failed")),
      "image/jpeg",
      JPEG_QUALITY,
    )
  })
}

// Upload a compressed blob directly from the browser to the property-photos
// bucket. Times out after 30 s so the UI never hangs forever.
// Returns the public URL of the stored file.
export async function uploadPropertyPhoto(blob: Blob, path: string): Promise<string> {
  const supabase = createClient()

  const uploadPromise = supabase.storage
    .from("property-photos")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false })

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Upload timed out — check your connection and try again")),
      UPLOAD_TIMEOUT_MS,
    )
  )

  const { error } = await Promise.race([uploadPromise, timeoutPromise])
  if (error) throw new Error(error.message)

  const { data: { publicUrl } } = supabase.storage
    .from("property-photos")
    .getPublicUrl(path)

  return publicUrl
}
