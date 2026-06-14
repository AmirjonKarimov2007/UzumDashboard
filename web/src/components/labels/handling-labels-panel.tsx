"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Minus, Plus, Printer, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  HANDLING_LABELS,
  MESSAGE_LABELS,
  printHandlingLabels,
  type HandlingLabelDef,
  type HandlingPrintEntry,
} from "@/lib/handling-labels";

const SIZES = [
  { key: "40x30", w: 40, h: 30, label: "40×30" },
  { key: "30x40", w: 30, h: 40, label: "30×40" },
  { key: "50x50", w: 50, h: 50, label: "50×50" },
  { key: "70x70", w: 70, h: 70, label: "70×70" },
  { key: "100x100", w: 100, h: 100, label: "100×100" },
];

/**
 * Handling-symbol + message label printer. Independent of the Uzum API — these
 * marks (Fragile / Keep dry / ... + "Xaridingiz uchun rahmat" kabi matnli
 * stikerlar) are static. Default size 40×30mm — termoprinter qog'oziga mos.
 */
export function HandlingLabelsPanel() {
  const [qty, setQty] = useState<Map<string, number>>(new Map());
  const [sizeKey, setSizeKey] = useState("40x30");
  const [showCaption, setShowCaption] = useState(true);
  const [printing, setPrinting] = useState(false);
  const size = SIZES.find((s) => s.key === sizeKey) ?? SIZES[0];

  const totalLabels = useMemo(
    () => Array.from(qty.values()).reduce((s, q) => s + q, 0),
    [qty],
  );
  const selectedCount = qty.size;

  const toggle = (id: string) =>
    setQty((prev) => {
      const n = new Map(prev);
      if (n.has(id)) n.delete(id);
      else n.set(id, 1);
      return n;
    });

  const setCount = (id: string, count: number) =>
    setQty((prev) => {
      const n = new Map(prev);
      if (count <= 0) n.delete(id);
      else n.set(id, Math.min(999, count));
      return n;
    });

  const clearAll = () => setQty(new Map());

  const handlePrint = async () => {
    if (qty.size === 0) return;
    setPrinting(true);
    try {
      const entries: HandlingPrintEntry[] = Array.from(qty.entries()).map(
        ([id, count]) => ({ id, count }),
      );
      const n = await printHandlingLabels(entries, {
        widthMm: size.w,
        heightMm: size.h,
        showCaption,
      });
      toast.success(`${n} ta yorliq chop etishga yuborildi`);
    } catch (err: any) {
      toast.error(`Chop etib bo'lmadi: ${err?.message || "xato"}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-5 pb-28">
      {/* Settings row */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#0f0f16] border border-[#1c1c24] p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#71717a]">O'lcham:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {SIZES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSizeKey(s.key)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                  sizeKey === s.key
                    ? "bg-[#8b5cf6] border-[#8b5cf6] text-white"
                    : "bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:border-[#3f3f46]",
                )}
              >
                {s.label}
              </button>
            ))}
            <span className="text-[11px] text-[#52525b] ml-1">mm</span>
          </div>
        </div>
        <div className="h-5 w-px bg-[#27272a] hidden sm:block" />
        <button
          onClick={() => setShowCaption((v) => !v)}
          className="flex items-center gap-2 text-xs text-[#a1a1aa]"
        >
          <span
            className={cn(
              "w-4 h-4 rounded border flex items-center justify-center",
              showCaption
                ? "bg-[#8b5cf6] border-[#8b5cf6]"
                : "border-[#3f3f46]",
            )}
          >
            {showCaption && <Check className="w-3 h-3 text-white" />}
          </span>
          Yozuv bilan
        </button>
      </div>

      {/* Qadoqlash belgilari */}
      <div>
        <p className="text-xs font-semibold text-[#71717a] uppercase tracking-widest mb-2.5">
          Qadoqlash belgilari
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {HANDLING_LABELS.map((label, i) => (
            <LabelTile
              key={label.id}
              label={label}
              index={i}
              isSel={qty.has(label.id)}
              count={qty.get(label.id) ?? 0}
              onToggle={toggle}
              onSetCount={setCount}
            />
          ))}
        </div>
      </div>

      {/* Minnatdorchilik (matnli) yorliqlari */}
      <div>
        <p className="text-xs font-semibold text-[#71717a] uppercase tracking-widest mb-2.5">
          Minnatdorchilik yorliqlari
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {MESSAGE_LABELS.map((label, i) => (
            <LabelTile
              key={label.id}
              label={label}
              index={i}
              isSel={qty.has(label.id)}
              count={qty.get(label.id) ?? 0}
              onToggle={toggle}
              onSetCount={setCount}
              wide
            />
          ))}
        </div>
      </div>

      {/* Sticky action bar */}
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl"
        >
          <div className="rounded-2xl bg-[#13131a]/95 backdrop-blur border border-[#8b5cf6]/30 shadow-2xl shadow-black/50 p-3 flex items-center gap-3">
            <button
              onClick={clearAll}
              className="w-9 h-9 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-center text-[#a1a1aa] flex-shrink-0"
              title="Tozalash"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {selectedCount} ta belgi · {totalLabels} ta yorliq
              </p>
              <p className="text-[11px] text-[#71717a]">
                {size.label}mm{showCaption ? " · yozuv bilan" : ""}
              </p>
            </div>
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:from-[#9d70f8] hover:to-[#7c3aed] text-white text-sm font-semibold transition-all disabled:opacity-60 shadow-lg shadow-[#8b5cf6]/20 flex-shrink-0"
            >
              {printing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              Chop etish
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function LabelTile({
  label,
  index,
  isSel,
  count,
  onToggle,
  onSetCount,
  wide,
}: {
  label: HandlingLabelDef;
  index: number;
  isSel: boolean;
  count: number;
  onToggle: (id: string) => void;
  onSetCount: (id: string, count: number) => void;
  /** Matnli yorliqlar 4:3 nisbatda (40×30 qog'ozga mos ko'rinish). */
  wide?: boolean;
}) {
  return (
    <div
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
      className={cn(
        "animate-fade-in rounded-xl border overflow-hidden transition-all",
        isSel
          ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/[0.06]"
          : "border-[#1c1c24] bg-[#0f0f16]",
      )}
    >
      <button
        onClick={() => onToggle(label.id)}
        className="w-full p-4 flex flex-col items-center gap-3 hover:bg-white/[0.02] transition-colors"
      >
        <div
          className={cn(
            "relative w-full rounded-lg bg-white flex items-center justify-center p-3",
            wide ? "aspect-[4/3]" : "aspect-square",
          )}
        >
          <div
            className="w-full h-full text-black [&_svg]:w-full [&_svg]:h-full"
            dangerouslySetInnerHTML={{ __html: label.svg }}
          />
          {isSel && (
            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#8b5cf6] flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-white" />
            </span>
          )}
        </div>
        <p className="text-[11px] font-medium text-white text-center leading-tight">
          {label.uz}
        </p>
      </button>

      {isSel && (
        <div
          className="flex items-center justify-center gap-1.5 px-3 pb-3"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onSetCount(label.id, count - 1)}
            className="w-7 h-7 rounded-lg bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-center text-[#a1a1aa]"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <input
            type="number"
            min={1}
            max={999}
            value={count}
            onChange={(e) =>
              onSetCount(label.id, parseInt(e.target.value || "0", 10))
            }
            className="w-12 h-7 text-center rounded-lg bg-[#18181b] border border-[#27272a] text-sm text-white tabular-nums focus:outline-none focus:border-[#8b5cf6] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={() => onSetCount(label.id, count + 1)}
            className="w-7 h-7 rounded-lg bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-center text-[#a1a1aa]"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
