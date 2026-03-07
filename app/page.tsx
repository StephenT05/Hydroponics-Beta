import { dbConnectionStatus } from "@/db/connection-status";
import { Badge } from "@/components/ui/badge";
import { connectToDatabase } from "@/lib/mongoose";
import WaterLevel from "@/models/WaterLevel";
import LiveWaterLevelSection from "@/components/LiveWaterLevelSection";

type WaterLevelView = {
  percentage?: number;
  gallons?: number;
  raw_distance?: number;
  is_filling?: boolean;
  rssi?: number;
  timestamp?: string;
};

const DEVICE_ACTIVE_WINDOW_SEC = Number(process.env.DEVICE_ACTIVE_WINDOW_SEC ?? 45);

function toPlainWaterLevel(input: unknown): WaterLevelView | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Record<string, unknown>;
  return {
    percentage: Number(raw.percentage ?? 0),
    gallons: Number(raw.gallons ?? 0),
    raw_distance: Number(raw.raw_distance ?? 0),
    is_filling: Boolean(raw.is_filling),
    rssi: Number(raw.rssi ?? 0),
    timestamp: raw.timestamp ? new Date(String(raw.timestamp)).toISOString() : undefined,
  };
}

const DATA = {
  title: "Hydroponics Water Monitor",
  description:
    "Real-time water level telemetry from ESP8266, stored in MongoDB for monitoring and charting.",
};

export default async function Home() {
  const result = await dbConnectionStatus();
  await connectToDatabase();
  const latestRaw = await WaterLevel.findOne().sort({ timestamp: -1 }).lean();
  const latestWaterLevel = toPlainWaterLevel(latestRaw);

  const lastSeenMs = latestWaterLevel?.timestamp
    ? new Date(latestWaterLevel.timestamp).getTime()
    : 0;
  const isDeviceActive =
    Number.isFinite(lastSeenMs) &&
    Date.now() - lastSeenMs <= DEVICE_ACTIVE_WINDOW_SEC * 1000;

  return (
    <div className="bg-neutral-100 dark:bg-neutral-950 dark:bg-[url('https://www.transparenttextures.com/patterns/cartographer.png')] dark:bg-repeat flex min-h-screen flex-col justify-center">
      <div className="relative z-10 mx-auto flex w-full max-w-full md:max-w-md flex-1 flex-col sm:p-3 sm:px-5 md:px-0 lg:max-w-xl bg-white dark:bg-black/30 border-2 border-blue-600 dark:border-transparent shadow-2xl">
         
          <main className="flex flex-1 flex-col m-5 mt-10">
            <h1 className="text-3xl font-semibold leading-none tracking-tighter md:text-4xl md:leading-none lg:text-5xl lg:leading-none">
              {DATA.title}
            </h1>
            <p className="mt-3.5 max-w-lg text-base leading-snug tracking-tight text-[#61646B] md:text-lg md:leading-snug lg:text-xl lg:leading-snug dark:text-[#94979E]">
              {DATA.description}
            </p>

            <LiveWaterLevelSection
              initialWaterLevel={latestWaterLevel}
              wsEnabled={isDeviceActive}
            />
          </main>

          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#023430] py-5 sm:gap-2 sm:gap-6 md:pb-12 md:pt-10 dark:border-[#023430]">
            <Badge
              variant={result === "Database connected" ? "default" : "destructive"}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                result === "Database connected"
                  ? "border-[#00ED64]/20 bg-[#00ED64]/10 text-[#00684A] dark:bg-[#00ED64]/10 dark:text-[#00ED64]"
                  : "border-red-500/20 bg-red-500/10 text-red-500 dark:text-red-500"
              }`}
            >
              {result}
            </Badge>
          </footer>
      </div>
    </div>
  );
}
