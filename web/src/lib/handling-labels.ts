// Packaging "handling" symbol labels (ISO 780 / GOST style): Fragile, Keep dry,
// This way up, Do not stack, Do not tilt. Pure black/white vector marks that the
// Yorliqlar page can print on label stock — no Uzum API needed.
//
// Icons are authored as inline SVG using `currentColor` so the same markup shows
// light on the dark dashboard and prints solid black on the label. Internal cuts
// (e.g. the crack on the glass) use fill-rule="evenodd" so the gap is a real hole
// in any theme.

import { printHtmlDocument } from "./qr-print";

export interface HandlingLabelDef {
  id: string;
  uz: string; // caption shown on the label (or short name for message labels)
  ru: string; // reference (original wording)
  svg: string; // viewBox 0 0 100 100 (symbols) yoki 0 0 100 75 (matnli), fill/stroke = currentColor
  /** Matnli yorliqlarda yozuv SVG ichida — alohida caption chiqarilmaydi. */
  noCaption?: boolean;
}

export const HANDLING_LABELS: HandlingLabelDef[] = [
  {
    id: "fragile",
    uz: "EHTIYOT, MO'RT",
    ru: "Осторожно, хрупкое",
    svg: `<svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" d="M30 14 L70 14 L58 41 Q54 46 50 47 Q46 46 42 41 Z M51 14 L44 26 L50 30 L43 43 L46.5 44 L53 30 L47 26 L54.5 14 Z"/>
      <rect x="47" y="47" width="6" height="30"/>
      <ellipse cx="50" cy="81" rx="22" ry="5"/>
    </svg>`,
  },
  {
    id: "keep-dry",
    uz: "NAMDAN SAQLANG",
    ru: "Беречь от влаги",
    svg: `<svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M28 8 C31 13 31 16 28 16 C25 16 25 13 28 8 Z"/>
      <path d="M50 4 C53 9 53 12 50 12 C47 12 47 9 50 4 Z"/>
      <path d="M72 8 C75 13 75 16 72 16 C69 16 69 13 72 8 Z"/>
      <path d="M16 52 A34 34 0 0 1 84 52 Z"/>
      <rect x="47" y="52" width="6" height="27"/>
      <path d="M53 79 A9 9 0 0 1 35 79 L41 79 A3 3 0 0 0 47 79 Z"/>
    </svg>`,
  },
  {
    id: "this-way-up",
    uz: "YUQORIGA",
    ru: "Верх",
    svg: `<svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="80" width="60" height="6"/>
      <rect x="33" y="36" width="8" height="38"/>
      <path d="M37 18 L21 40 L53 40 Z"/>
      <rect x="59" y="36" width="8" height="38"/>
      <path d="M63 18 L47 40 L79 40 Z"/>
    </svg>`,
  },
  {
    id: "no-stack",
    uz: "USTIGA QO'YMANG",
    ru: "Запрещено штабелировать",
    svg: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect x="32" y="58" width="36" height="30" fill="currentColor"/>
      <rect x="32" y="22" width="36" height="28" fill="currentColor"/>
      <line x1="16" y1="14" x2="84" y2="58" stroke-width="8"/>
      <line x1="84" y1="14" x2="16" y2="58" stroke-width="8"/>
    </svg>`,
  },
  {
    id: "no-tilt",
    uz: "AG'DARMANG",
    ru: "Не кантовать",
    svg: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect x="34" y="56" width="32" height="30" fill="currentColor"/>
      <path d="M20 52 A32 28 0 0 1 80 52" stroke-width="6" stroke-linecap="round"/>
      <path d="M20 52 L16 38 L30 44 Z" fill="currentColor" stroke="none"/>
      <path d="M80 52 L84 38 L70 44 Z" fill="currentColor" stroke="none"/>
      <line x1="22" y1="14" x2="78" y2="52" stroke-width="7"/>
      <line x1="78" y1="14" x2="22" y2="52" stroke-width="7"/>
    </svg>`,
  },
];

// ─── Matnli minnatdorchilik yorliqlari ──────────────────────────────────
// "Xaridingiz uchun rahmat", "izoh qoldiring" kabi xabarli stikerlar.
// 30×40 / 40×30 mm termoprinter qog'oziga mo'ljallangan (viewBox 4:3).
// Yozuv SVG ichida (text element) — shrift chop etishda ham bir xil chiqadi.
// DIQQAT: <defs>/<use> ishlatilmaydi — bir sahifada bir nechta yorliq bo'lsa
// id to'qnashuvi bo'lmasligi uchun yulduz/yurak shakllari inline takrorlanadi.

const STAR = "M0,-4.6 L1.35,-1.45 L4.4,-1.45 L1.95,0.55 L2.85,3.7 L0,1.8 L-2.85,3.7 L-1.95,0.55 L-4.4,-1.45 L-1.35,-1.45 Z";
const HEART = "M0,4.2 C-1.2,2.2 -5,-0.3 -5,-2.8 C-5,-4.8 -3.2,-5.8 -1.8,-5 C-0.8,-4.4 0,-3.3 0,-3.3 C0,-3.3 0.8,-4.4 1.8,-5 C3.2,-5.8 5,-4.8 5,-2.8 C5,-0.3 1.2,2.2 0,4.2 Z";
const FONT = "'Segoe UI', Arial, sans-serif";

const starsRow = (y: number, scale = 1) =>
  [30, 40, 50, 60, 70]
    .map((x) => `<path transform="translate(${x},${y}) scale(${scale})" d="${STAR}"/>`)
    .join("");

export const MESSAGE_LABELS: HandlingLabelDef[] = [
  {
    id: "rahmat-izoh",
    uz: "Rahmat + izoh",
    ru: "Спасибо за покупку, оставьте отзыв",
    noCaption: true,
    svg: `<svg viewBox="0 0 100 75" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      ${starsRow(13, 0.95)}
      <text x="50" y="33" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="9">XARIDINGIZ UCHUN</text>
      <text x="50" y="47" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="13">RAHMAT!</text>
      <text x="50" y="60" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="5.8">Iltimos, mahsulotga izoh</text>
      <text x="50" y="68" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="5.8">qoldirishni unutmang</text>
    </svg>`,
  },
  {
    id: "baho-bering",
    uz: "5 yulduz baho",
    ru: "Понравилось? Поставьте 5 звёзд",
    noCaption: true,
    svg: `<svg viewBox="0 0 100 75" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <text x="50" y="18" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="10">SIZGA YOQDIMI?</text>
      ${starsRow(34, 1.25)}
      <text x="50" y="56" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="6">5 yulduz baho qoldiring —</text>
      <text x="50" y="66" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="6">bu biz uchun juda muhim!</text>
    </svg>`,
  },
  {
    id: "rahmat-heart",
    uz: "Rahmat ♥",
    ru: "Спасибо, что выбрали нас",
    noCaption: true,
    svg: `<svg viewBox="0 0 100 75" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path transform="translate(50,13) scale(1.7)" d="${HEART}"/>
      <text x="50" y="43" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="14">RAHMAT!</text>
      <text x="50" y="58" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="5.8">Bizni tanlaganingiz uchun</text>
      <text x="50" y="66.5" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="5.8">minnatdormiz</text>
    </svg>`,
  },
  {
    id: "qadrli-mijoz",
    uz: "Qadrli mijoz",
    ru: "Дорогой клиент, мы на связи",
    noCaption: true,
    svg: `<svg viewBox="0 0 100 75" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <text x="50" y="20" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="10">QADRLI MIJOZ!</text>
      <rect x="35" y="26" width="30" height="1.2" rx="0.6"/>
      <text x="50" y="40" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="6">Savol yoki taklif bo'lsa,</text>
      <text x="50" y="49" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="6">izoh qoldiring —</text>
      <text x="50" y="58" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="6">albatta javob beramiz</text>
      <path transform="translate(50,68) scale(0.9)" d="${HEART}"/>
    </svg>`,
  },
  {
    id: "mehr-bilan",
    uz: "Mehr bilan",
    ru: "Сделано с любовью",
    noCaption: true,
    svg: `<svg viewBox="0 0 100 75" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path transform="translate(50,12) scale(1.4)" d="${HEART}"/>
      <text x="50" y="36" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="10.5">MEHR BILAN</text>
      <text x="50" y="50" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="10.5">TAYYORLANDI</text>
      <text x="50" y="65" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="6">Xaridingiz uchun rahmat!</text>
    </svg>`,
  },
  {
    id: "yana-kutamiz",
    uz: "Yana kutamiz",
    ru: "Будем ждать вас снова",
    noCaption: true,
    svg: `<svg viewBox="0 0 100 75" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="46.8" cy="11" r="1.1"/>
      <circle cx="53.2" cy="11" r="1.1"/>
      <path d="M45.5,15.5 Q50,19.5 54.5,15.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <text x="50" y="37" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="9.5">XARIDINGIZDAN</text>
      <text x="50" y="51" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="11">MAMNUNMIZ!</text>
      <text x="50" y="65" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="6">Yana kutib qolamiz!</text>
    </svg>`,
  },
];

export function handlingLabelById(id: string): HandlingLabelDef | undefined {
  return (
    HANDLING_LABELS.find((h) => h.id === id) ||
    MESSAGE_LABELS.find((h) => h.id === id)
  );
}

export interface HandlingPrintEntry {
  id: string;
  count: number;
}

export interface HandlingPrintOptions {
  /** Label page width in millimetres. */
  widthMm: number;
  /** Label page height in millimetres. */
  heightMm: number;
  showCaption: boolean;
}

/**
 * Build a one-label-per-page document at the chosen page size and send it to
 * the printer. Copies of the same label print consecutively. Returns the total
 * number of label pages produced. Matnli yorliqlarda (noCaption) alohida yozuv
 * chiqarilmaydi — matn SVG ichida.
 */
export async function printHandlingLabels(
  entries: HandlingPrintEntry[],
  opts: HandlingPrintOptions,
): Promise<number> {
  const resolved = entries
    .map((e) => ({ def: handlingLabelById(e.id), count: Math.max(1, e.count) }))
    .filter((x): x is { def: HandlingLabelDef; count: number } => !!x.def);

  const total = resolved.reduce((s, x) => s + x.count, 0);
  if (total === 0) return 0;

  const { widthMm, heightMm, showCaption } = opts;
  const minMm = Math.min(widthMm, heightMm);
  const pad = (minMm * 0.07).toFixed(2);
  const capPt = Math.max(7, Math.round(minMm * 0.11));

  const pages: string[] = [];
  for (const { def, count } of resolved) {
    const withCap = showCaption && !def.noCaption;
    for (let i = 0; i < count; i++) {
      pages.push(
        `<div class="label"><div class="icon ${withCap ? "w-cap" : ""}">${def.svg}</div>${
          withCap ? `<div class="cap">${escapeHtml(def.uz)}</div>` : ""
        }</div>`,
      );
    }
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    .label {
      width: ${widthMm}mm; height: ${heightMm}mm; padding: ${pad}mm;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      page-break-after: always; color: #000;
    }
    .label:last-child { page-break-after: auto; }
    .icon { flex: 1; width: 94%; display: flex; align-items: center; justify-content: center; min-height: 0; }
    .icon.w-cap { width: 78%; }
    .icon svg { width: 100%; height: 100%; max-height: 100%; }
    .cap { margin-top: ${(minMm * 0.04).toFixed(2)}mm; font: 700 ${capPt}pt "Segoe UI", system-ui, -apple-system, Arial, sans-serif; text-align: center; letter-spacing: .4px; }
  </style></head><body>${pages.join("")}</body></html>`;

  await printHtmlDocument(html);
  return total;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
