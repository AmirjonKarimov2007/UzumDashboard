import { cn } from "@/lib/utils";

const themeByKey: Record<string, string> = {
  "plate-black": "from-[#191715] via-[#2d2923] to-[#070707]",
  "lagan-green": "from-[#ecf7ef] via-[#d4ead9] to-[#5f8f64]",
  "national-platter": "from-[#e8f3f4] via-[#fff8e7] to-[#236272]",
  teapot: "from-[#fff8ea] via-[#f3e1bf] to-[#b68139]",
  mug: "from-[#efe9dc] via-[#d1d8d4] to-[#6b7b79]",
  shaker: "from-[#f6f7f5] via-[#cfd3ce] to-[#6f7772]",
  basket: "from-[#f9edd4] via-[#dfbb7d] to-[#8d6330]",
  tray: "from-[#eee6d6] via-[#c6bca8] to-[#252420]",
};

export function ProductVisual({
  imageKey,
  name,
  className,
}: {
  imageKey: string;
  name: string;
  className?: string;
}) {
  const theme = themeByKey[imageKey] ?? "from-[#fffaf0] via-[#eee1c9] to-[#b7a179]";
  const isCutlery = ["spoon", "fork", "knife"].includes(imageKey);

  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        "relative min-h-[190px] overflow-hidden rounded-2xl bg-gradient-to-br",
        theme,
        className
      )}
    >
      <div className="absolute inset-4 rounded-[2rem] border border-white/45" />
      <div className="absolute left-5 top-5 h-16 w-16 rounded-full bg-white/40 blur-xl" />
      {isCutlery ? (
        <div className="absolute inset-0 flex items-center justify-center gap-3">
          <span className="h-32 w-3 rounded-full bg-white/80 shadow-lg" />
          <span className="h-36 w-3 rounded-full bg-[#f7f2e7]/90 shadow-lg" />
          <span className="h-28 w-3 rounded-full bg-[#d9d2c4]/90 shadow-lg" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="grid h-32 w-32 place-items-center rounded-full bg-white/75 shadow-[0_24px_70px_rgba(43,33,20,0.18)] ring-8 ring-white/30">
            <div className="h-20 w-20 rounded-full border border-[#d3c3a8] bg-gradient-to-br from-white to-[#eee3d0]" />
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-[#17382d] shadow-sm">
        B2B katalog
      </div>
    </div>
  );
}
