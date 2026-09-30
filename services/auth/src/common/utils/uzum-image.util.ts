export type UzumImageSize = "thumb" | "medium" | "high";

const sizeKeys: Record<UzumImageSize, string[]> = {
  thumb: ["240", "120", "80", "60", "480", "540", "720", "800"],
  medium: ["540", "480", "720", "240", "800", "120", "80", "60"],
  high: ["800", "720", "540", "480", "240", "120", "80", "60"],
};

const fileBySize: Record<UzumImageSize, string> = {
  thumb: "t_product_240_high.jpg",
  medium: "t_product_540_high.jpg",
  high: "original.jpg",
};

function normalizeString(raw: string, size: UzumImageSize): string | null {
  const value = raw.trim();
  if (!value) return null;
  const full = value.startsWith("//") ? `https:${value}` : value;
  if (/^[a-z0-9_-]{12,}$/i.test(full)) {
    return `https://images.uzum.uz/${full}/${fileBySize[size]}`;
  }
  try {
    const url = new URL(full);
    if (url.hostname !== "images.uzum.uz") return url.toString();
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 1) {
      url.pathname = `/${parts[0]}/${fileBySize[size]}`;
    } else if (
      parts.length >= 2 &&
      /^(?:t_product_[^/]+|original)\.jpg$/i.test(parts.at(-1)!)
    ) {
      parts[parts.length - 1] = fileBySize[size];
      url.pathname = `/${parts.join("/")}`;
    }
    return url.toString();
  } catch {
    return null;
  }
}
/** Handles string URLs, photoKey, photo size maps and nested product/SKU fields. */
export function extractUzumImageUrl(
  source: unknown,
  size: UzumImageSize = "medium",
  seen: Set<unknown> = new Set(),
): string | null {
  if (source == null || seen.has(source)) return null;
  if (typeof source === "string") return normalizeString(source, size);
  if (Array.isArray(source)) {
    seen.add(source);
    for (const value of source) {
      const result = extractUzumImageUrl(value, size, seen);
      if (result) return result;
    }
    return null;
  }
  if (typeof source !== "object") return null;

  seen.add(source);
  const object = source as Record<string, unknown>;
  if (typeof object.photoKey === "string") {
    const result = normalizeString(object.photoKey, size);
    if (result) return result;
  }
  for (const key of sizeKeys[size]) {
    const entry = object[key] as Record<string, unknown> | undefined;
    if (!entry || typeof entry !== "object") continue;
    for (const value of [entry.high, entry.low]) {
      const result = extractUzumImageUrl(value, size, seen);
      if (result) return result;
    }
  }
  for (const key of [
    "url",
    "src",
    "imageUrl",
    "imageUrls",
    "image",
    "previewImg",
    "previewImage",
    "productImage",
    "photo",
  ]) {
    const result = extractUzumImageUrl(object[key], size, seen);
    if (result) return result;
  }
  for (const value of Object.values(object)) {
    const result = extractUzumImageUrl(value, size, seen);
    if (result) return result;
  }
  return null;
}
