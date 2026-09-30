export type UzumImageSize = "thumb" | "medium" | "high";

const SIZE_KEYS: Record<UzumImageSize, string[]> = {
  thumb: ["240", "120", "80", "60", "480", "540", "720", "800"],
  medium: ["540", "480", "720", "240", "800", "120", "80", "60"],
  high: ["800", "720", "540", "480", "240", "120", "80", "60"],
};

const FILE_BY_SIZE: Record<UzumImageSize, string> = {
  thumb: "t_product_240_high.jpg",
  medium: "t_product_540_high.jpg",
  high: "original.jpg",
};

const DIRECT_KEYS = [
  "url",
  "src",
  "imageUrl",
  "imageUrls",
  "image",
  "previewImg",
  "previewImage",
  "productImage",
  "photo",
] as const;

function normalizeString(raw: string, size: UzumImageSize): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("/")) return value;

  const withProtocol = value.startsWith("//") ? `https:${value}` : value;
  if (/^[a-z0-9_-]{12,}$/i.test(withProtocol)) {
    return `https://images.uzum.uz/${withProtocol}/${FILE_BY_SIZE[size]}`;
  }

  try {
    const url = new URL(withProtocol);
    if (url.hostname !== "images.uzum.uz") return url.toString();

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 1) {
      url.pathname = `/${parts[0]}/${FILE_BY_SIZE[size]}`;
    } else if (parts.length >= 2 && /^(?:t_product_[^/]+|original)\.jpg$/i.test(parts.at(-1)!)) {
      parts[parts.length - 1] = FILE_BY_SIZE[size];
      url.pathname = `/${parts.join("/")}`;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function fromObject(source: Record<string, unknown>, size: UzumImageSize, seen: Set<unknown>): string | null {
  const photoKey = source.photoKey;
  if (typeof photoKey === "string") {
    const byKey = normalizeString(photoKey, size);
    if (byKey) return byKey;
  }

  const orderedSizes = SIZE_KEYS[size];
  for (const key of orderedSizes) {
    const candidate = source[key];
    if (candidate && typeof candidate === "object") {
      const entry = candidate as Record<string, unknown>;
      const preferred = size === "high" ? [entry.high, entry.low] : [entry.high, entry.low];
      for (const value of preferred) {
        const result = extractUzumImageUrl(value, size, seen);
        if (result) return result;
      }
    }
  }

  for (const key of DIRECT_KEYS) {
    const result = extractUzumImageUrl(source[key], size, seen);
    if (result) return result;
  }

  for (const value of Object.values(source)) {
    const result = extractUzumImageUrl(value, size, seen);
    if (result) return result;
  }
  return null;
}

/** Extracts an Uzum product image from every shape used by Seller OpenAPI. */
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

  if (typeof source === "object") {
    seen.add(source);
    return fromObject(source as Record<string, unknown>, size, seen);
  }
  return null;
}

/**
 * Keeps third-party CDN/TLS failures out of the browser by loading Uzum images
 * through our same-origin, allow-listed route. Other image hosts stay direct.
 */
export function productImageUrl(source: unknown, size: UzumImageSize = "medium"): string | null {
  const url = extractUzumImageUrl(source, size);
  if (!url || url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const parsed = new URL(url);
    // `/api/*` is reserved for the Nest backend in production nginx. Keep the
    // Next.js image proxy outside that namespace so it reaches the web server.
    return parsed.hostname === "images.uzum.uz"
      ? `/image-proxy?url=${encodeURIComponent(parsed.toString())}`
      : parsed.toString();
  } catch {
    return null;
  }
}
