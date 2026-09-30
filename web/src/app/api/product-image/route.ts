import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function allowedImageUrl(value: string | null): URL | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "images.uzum.uz")
      return null;
    return url;
  } catch {
    return null;
  }
}
export async function GET(request: NextRequest) {
  const source = allowedImageUrl(request.nextUrl.searchParams.get("url"));
  if (!source)
    return NextResponse.json({ message: "Invalid image URL" }, { status: 400 });

  try {
    const upstream = await fetch(source, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; UzumDashboard/1.0)",
      },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { message: "Image unavailable" },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json(
        { message: "Unexpected upstream content" },
        { status: 502 },
      );
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Image fetch failed" },
      { status: 502 },
    );
  }
}
