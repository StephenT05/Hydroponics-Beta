import { WebSocketServer, type WebSocket } from "ws";

type WaterLevelPayload = {
  percentage?: number;
  gallons?: number;
  raw_distance?: number;
  is_filling?: boolean;
  rssi?: number;
  timestamp?: string | Date;
};

type BroadcastMessage = {
  type: "water-level:update";
  data: WaterLevelPayload;
};

/* eslint-disable no-var */
declare global {
  var waterWsServer: WebSocketServer | undefined;
}
/* eslint-enable no-var */

const WS_PORT = Number(process.env.WS_PORT ?? 3010);

function ensureServer() {
  if (global.waterWsServer) {
    return global.waterWsServer;
  }

  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on("connection", (socket: WebSocket) => {
    socket.send(
      JSON.stringify({
        type: "water-level:update",
        data: { timestamp: new Date().toISOString() },
      } satisfies BroadcastMessage),
    );
  });

  wss.on("error", (error: Error) => {
    console.error("WebSocket server error:", error);
  });

  global.waterWsServer = wss;
  console.log(`WebSocket server listening on ws://localhost:${WS_PORT}`);
  return wss;
}

export function broadcastWaterLevel(data: WaterLevelPayload) {
  const wss = ensureServer();
  const payload = JSON.stringify({
    type: "water-level:update",
    data,
  } satisfies BroadcastMessage);

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}
