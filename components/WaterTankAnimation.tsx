type WaterTankAnimationProps = {
  percentage: number;
  gallons: number;
  isFilling: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function WaterTankAnimation({
  percentage,
  gallons,
  isFilling,
}: WaterTankAnimationProps) {
  const safePercentage = clamp(Number.isFinite(percentage) ? percentage : 0, 0, 100);
  const safeGallons = Number.isFinite(gallons) ? gallons : 0;

  return (
    <section className="mt-8 rounded-2xl border border-cyan-900/20 bg-cyan-50/30 p-4 dark:border-cyan-200/15 dark:bg-cyan-950/20">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Tank Fill Animation</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            isFilling
              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : "bg-slate-500/20 text-slate-700 dark:text-slate-300"
          }`}
        >
          {isFilling ? "Filling" : "Stable"}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-4">
        <div className="relative h-56 w-36 overflow-hidden rounded-b-[1.8rem] rounded-t-[1.2rem] border-2 border-sky-500/40 bg-transparent">
          <div
            className="absolute inset-x-0 bottom-0 tank-water transition-[height] duration-700 ease-out"
            style={{ height: `${safePercentage}%` }}
          >
            {isFilling ? <div className="tank-sine-wave" /> : null}
          </div>
        </div>

        <div className="pb-2">
          <p className="text-3xl font-bold tracking-tight text-sky-700 dark:text-sky-300">
            {safeGallons.toFixed(2)} gal
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{safePercentage.toFixed(1)}% full</p>
        </div>
      </div>
    </section>
  );
}
