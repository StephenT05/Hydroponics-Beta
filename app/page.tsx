import { dbConnectionStatus } from "@/db/connection-status";
import { Badge } from "@/components/ui/badge";
import { connectToDatabase } from "@/lib/mongoose";
import WaterLevel from "@/models/WaterLevel";
import WaterTankAnimation from "@/components/WaterTankAnimation";

type WaterLevelView = {
  percentage?: number;
  gallons?: number;
  raw_distance?: number;
  is_filling?: boolean;
  rssi?: number;
  timestamp?: Date | string;
};

const DATA = {
  title: "Hydroponics Water Monitor",
  description:
    "Real-time water level telemetry from ESP8266, stored in MongoDB for monitoring and charting.",
};

export default async function Home() {
  const result = await dbConnectionStatus();
  await connectToDatabase();
  const latestWaterLevel = (await WaterLevel.findOne().sort({ timestamp: -1 }).lean()) as
    | WaterLevelView
    | null;

  const latestTimestamp = latestWaterLevel?.timestamp
    ? new Date(latestWaterLevel.timestamp).toLocaleString()
    : "No readings yet";

  const percentage = Number(latestWaterLevel?.percentage ?? 0);
  const gallons = Number(latestWaterLevel?.gallons ?? 0);
  const isFilling = Boolean(latestWaterLevel?.is_filling);

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

            <WaterTankAnimation
              percentage={percentage}
              gallons={gallons}
              isFilling={isFilling}
            />

            <section className="mt-8 rounded-xl border border-[#023430]/20 bg-[#001E2B]/5 p-4 dark:border-[#00ED64]/20 dark:bg-[#00ED64]/5">
              <h2 className="text-lg font-semibold tracking-tight">Latest Water Level</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:text-base">
                <p>
                  Percentage: <span className="font-semibold">{latestWaterLevel?.percentage ?? "-"}%</span>
                </p>
                <p>
                  Gallons: <span className="font-semibold">{latestWaterLevel?.gallons ?? "-"}</span>
                </p>
                <p>
                  Raw Distance: <span className="font-semibold">{latestWaterLevel?.raw_distance ?? "-"}</span>
                </p>
                <p>
                  RSSI: <span className="font-semibold">{latestWaterLevel?.rssi ?? "-"} dBm</span>
                </p>
                <p>
                  Filling: <span className="font-semibold">{latestWaterLevel?.is_filling ? "Yes" : "No"}</span>
                </p>
                <p>
                  Timestamp: <span className="font-semibold">{latestTimestamp}</span>
                </p>
              </div>
            </section>
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
