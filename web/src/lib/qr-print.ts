// Shared QR-code label PDF generator (40×30mm Xprinter labels).
// Extracted from the FBS orders page so the Yorliqlar page can reuse the
// exact same label layout: centered vector QR + vertical SKU title (left) +
// vertical barcode digits (right, last 4 enlarged).

export interface QrLabelEntry {
  barcode: string;
  skuTitle?: string;
  title?: string;
  /** How many copies of this label. Entries are aggregated by barcode. */
  count?: number;
}

/**
 * Print an arbitrary HTML document via a hidden iframe. Used for tables /
 * picking sheets where native system fonts render Cyrillic & Uzbek text
 * correctly (pdf-lib's standard fonts can't). The browser's "Save as PDF"
 * option in the print dialog produces the PDF.
 */
export function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); resolve(); return; }
    doc.open();
    doc.write(html);
    doc.close();

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      try { document.body.removeChild(iframe); } catch {}
      resolve();
    };
    const onFocus = () => setTimeout(finish, 250);

    // Give the browser a tick to lay out images/fonts before printing
    setTimeout(() => {
      const win = iframe.contentWindow;
      if (!win) { finish(); return; }
      win.focus();
      win.print();
      window.addEventListener("focus", onFocus);
      win.addEventListener("afterprint", finish, { once: true });
      setTimeout(finish, 30_000);
    }, 300);
  });
}

/** Print a PDF blob via a hidden iframe (auto-opens the browser print dialog). */
export function printPdfBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;
    document.body.appendChild(iframe);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      try { document.body.removeChild(iframe); } catch {}
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) { cleanup(); resolve(); return; }

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.removeEventListener("focus", onWindowFocus);
          cleanup();
          resolve();
        };
        // The main window regains focus when the print dialog closes —
        // whether the user printed OR cancelled. This reliably ends the
        // loading state (afterprint doesn't fire on cancel in some browsers).
        const onWindowFocus = () => setTimeout(finish, 250);

        win.focus();
        win.print();
        window.addEventListener("focus", onWindowFocus);
        win.addEventListener("afterprint", finish, { once: true });
        // Last-resort fallback so the promise never hangs forever
        setTimeout(finish, 30_000);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    iframe.onerror = () => { cleanup(); reject(new Error("iframe load failed")); };
  });
}

/**
 * Build a 40×30mm-per-page QR-label PDF and send it to the printer.
 *
 * Entries are AGGREGATED by barcode (counts summed) and SORTED by SKU, so all
 * copies of one SKU print consecutively — finish one SKU, then the next.
 *
 * Heavy work (QR matrix, the rotated Cyrillic SKU title PNG, font sizing) is
 * computed ONCE per unique SKU and reused across all its copies, instead of
 * per label. For e.g. 50 copies of one SKU this is ~50× less canvas/embed work.
 *
 * Returns the number of labels generated. `onProgress` reports page progress.
 */
export async function printQrLabels(
  entries: QrLabelEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (entries.length === 0) return 0;

  // ── Aggregate by barcode, then sort by SKU (group same SKU together) ──
  const groupsMap = new Map<string, { barcode: string; skuTitle: string; count: number }>();
  for (const e of entries) {
    const barcode = String(e.barcode || "").trim();
    if (!barcode) continue;
    const add = Math.max(1, e.count ?? 1);
    const ex = groupsMap.get(barcode);
    if (ex) ex.count += add;
    else groupsMap.set(barcode, { barcode, skuTitle: e.skuTitle || "", count: add });
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) =>
    (a.skuTitle || a.barcode).localeCompare(b.skuTitle || b.barcode),
  );
  const totalLabels = groups.reduce((s, g) => s + g.count, 0);
  if (totalLabels === 0) return 0;

  const QRCode = (await import("qrcode")).default;
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  // 40mm (width) × 30mm (height) in points (1mm = 2.83465pt)
  const W = 40 * 2.83465;
  const H = 30 * 2.83465;
  const qrSize = H * 0.78;
  const qrX = (W - qrSize) / 2;
  const qrY = (H - qrSize) / 2;
  const verticalMargin = 4;
  const maxVertical = H - verticalMargin * 2;
  const sideTextLift = 2.5;
  const overlap = 0.05;

  const toAscii = (s: string) => (s || "").replace(/[^\x20-\x7E]/g, "").replace(/[-\s]+$/, "").trim();
  const fitFontSize = (text: string, maxLen: number, desired: number, minSize = 4) => {
    let size = desired;
    while (size > minSize && boldFont.widthOfTextAtSize(text, size) > maxLen) size -= 0.5;
    return size;
  };
  // Render text rotated 90° CCW onto a canvas → PNG bytes (handles Cyrillic/Unicode).
  const renderVerticalTextPng = (text: string, fontPx: number, scale = 4) => {
    const fontFamily = '"Segoe UI", system-ui, -apple-system, "Noto Sans", Arial, sans-serif';
    const cssFont = `bold ${fontPx * scale}px ${fontFamily}`;
    const meas = document.createElement("canvas").getContext("2d");
    if (!meas) throw new Error("Canvas 2D context unavailable");
    meas.font = cssFont;
    const textWPx = Math.ceil(meas.measureText(text).width);
    const textHPx = Math.ceil(fontPx * scale * 1.25);
    const canvas = document.createElement("canvas");
    canvas.width = textHPx;
    canvas.height = textWPx;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.font = cssFont;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(text, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    return { bytes, widthPt: textHPx / scale, heightPt: textWPx / scale };
  };

  let done = 0;
  for (const g of groups) {
    // ── Compute everything for this SKU ONCE ──
    const qr = QRCode.create(g.barcode, { errorCorrectionLevel: "M" });
    const modulesSize = qr.modules.size;
    const modulesData = qr.modules.data;
    const moduleSize = qrSize / modulesSize;

    const safeBarcode = toAscii(g.barcode);
    const last4Digits = safeBarcode.slice(-4);
    const restBarcode = safeBarcode.slice(0, -4);
    const safeSkuTitle = (g.skuTitle || "").replace(/[\x00-\x1F\x7F]/g, "").replace(/[\s-]+$/, "").trim();

    // SKU title image — render + embed once, reuse on every copy
    let skuImg: any = null, skuW = 0, skuH = 0;
    if (safeSkuTitle) {
      let skuFontPx = 11;
      let strip = renderVerticalTextPng(safeSkuTitle, skuFontPx);
      while (strip.heightPt > maxVertical && skuFontPx > 5) {
        skuFontPx -= 0.5;
        strip = renderVerticalTextPng(safeSkuTitle, skuFontPx);
      }
      skuImg = await pdf.embedPng(strip.bytes);
      skuW = strip.widthPt; skuH = strip.heightPt;
    }

    // Barcode text geometry — once
    const gap = 2;
    const lastFontSize = fitFontSize(last4Digits, maxVertical * 0.4, 14);
    const lastWidth = boldFont.widthOfTextAtSize(last4Digits, lastFontSize);
    const restFontSize = restBarcode ? fitFontSize(restBarcode, maxVertical - lastWidth - gap, 12) : 0;
    const restWidth = restBarcode ? boldFont.widthOfTextAtSize(restBarcode, restFontSize) : 0;
    const bcTotalWidth = restWidth + (restBarcode ? gap : 0) + lastWidth;
    const bottomY = (H - bcTotalWidth) / 2 + sideTextLift + 3;
    const anchorX = W - 2;

    // ── Emit `count` identical pages, reusing the precomputed values ──
    for (let i = 0; i < g.count; i++) {
      const page = pdf.addPage([W, H]);
      for (let row = 0; row < modulesSize; row++) {
        for (let col = 0; col < modulesSize; col++) {
          if (modulesData[row * modulesSize + col]) {
            page.drawRectangle({
              x: qrX + col * moduleSize,
              y: qrY + qrSize - (row + 1) * moduleSize,
              width: moduleSize + overlap,
              height: moduleSize + overlap,
              color: rgb(0, 0, 0),
            });
          }
        }
      }
      if (skuImg) {
        page.drawImage(skuImg, { x: qrX - skuW, y: (H - skuH) / 2 + sideTextLift, width: skuW, height: skuH });
      }
      if (safeBarcode) {
        if (restBarcode) {
          page.drawText(restBarcode, { x: anchorX, y: bottomY, size: restFontSize, font: boldFont, color: rgb(0, 0, 0), rotate: degrees(90) });
        }
        page.drawText(last4Digits, { x: anchorX, y: bottomY + restWidth + (restBarcode ? gap : 0), size: lastFontSize, font: boldFont, color: rgb(0, 0, 0), rotate: degrees(90) });
      }
      done++;
      onProgress?.(done, totalLabels);
    }
  }

  const bytes = await pdf.save();
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: "application/pdf" });
  await printPdfBlob(blob);
  return totalLabels;
}
