"use client";

import { useEffect, useMemo, useState } from "react";
import WaterTankAnimation from "@/components/WaterTankAnimation";

type WaterLevelView = {
  percentage?: number;
  gallons?: number;
  raw_distance?: number;
  is_filling?: boolean;
  rssi?: number;
  timestamp?: string;
};

type Props = {
  initialWaterLevel: WaterLevelView | null;
  wsEnabled: boolean;
};

type WsMessage = {
  type: "water-level:update";
  data?: WaterLevelView;
};

export default function LiveWaterLevelSection({ initialWaterLevel, wsEnabled }: Props) {
  const [waterLevel, setWaterLevel] = useState<WaterLevelView | null>(initialWaterLevel);

  const wsPort = useMemo(() => process.env.NEXT_PUBLIC_WS_PORT ?? "3010", []);

  useEffect(() => {
    if (!wsEnabled) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.hostname}:${wsPort}`);

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as WsMessage;
        if (parsed.type === "water-level:update" && parsed.data?.percentage !== undefined) {
          setWaterLevel(parsed.data);
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    return () => {
      socket.close();
    };
  }, [wsEnabled, wsPort]);

  const latestTimestamp = waterLevel?.timestamp
    ? new Date(waterLevel.timestamp).toLocaleString()
    : "No readings yet";

  const percentage = Number(waterLevel?.percentage ?? 0);
  const gallons = Number(waterLevel?.gallons ?? 0);
  const isFilling = Boolean(waterLevel?.is_filling);

  return (
    <>
      <WaterTankAnimation
        percentage={percentage}
        gallons={gallons}
        isFilling={isFilling}
      />

      <section className="mt-8 rounded-xl border border-[#023430]/20 bg-[#001E2B]/5 p-4 dark:border-[#00ED64]/20 dark:bg-[#00ED64]/5">
        <h2 className="text-lg font-semibold tracking-tight">Latest Water Level</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:text-base">
          <p>
            Percentage: <span className="font-semibold">{waterLevel?.percentage ?? "-"}%</span>
          </p>
          <p>
            Gallons: <span className="font-semibold">{waterLevel?.gallons ?? "-"}</span>
          </p>
          <p>
            Raw Distance: <span className="font-semibold">{waterLevel?.raw_distance ?? "-"}</span>
          </p>
          <p>
            RSSI: <span className="font-semibold">{waterLevel?.rssi ?? "-"} dBm</span>
          </p>
          <p>
            Filling: <span className="font-semibold">{waterLevel?.is_filling ? "Yes" : "No"}</span>
          </p>
          <p>
            Timestamp: <span className="font-semibold">{latestTimestamp}</span>
          </p>
        </div>
      </section>
    </>
  );
}
