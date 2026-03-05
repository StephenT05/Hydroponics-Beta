import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import WaterLevel from "@/models/WaterLevel";

async function ensureWaterLevelCollection() {
  try {
    await WaterLevel.createCollection();
  } catch (error) {
    const maybeMongoError = error as { code?: number };
    // Ignore "NamespaceExists" when collection already exists.
    if (maybeMongoError.code !== 48) {
      throw error;
    }
  }
}

function calculateGallons(percentage: number) {
  const tankCapacityGallons = Number(process.env.WATER_TANK_CAPACITY_GALLONS ?? 5);
  if (!Number.isFinite(tankCapacityGallons) || tankCapacityGallons <= 0) {
    return 0;
  }
  const normalizedPercent = Math.min(Math.max(percentage, 0), 100);
  return Number(((normalizedPercent / 100) * tankCapacityGallons).toFixed(3));
}

export async function GET() {
  try {
    await connectToDatabase();
    await ensureWaterLevelCollection();

    const latest = await WaterLevel.findOne().sort({ timestamp: -1 }).lean();

    return NextResponse.json({
      ok: true,
      data: latest,
    });
  } catch (error) {
    console.error("GET /api/water-level failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to fetch water level",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const percentage = Number(body?.percentage);

    if (!Number.isFinite(percentage) || percentage < 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "`percentage` must be a number >= 0",
        },
        { status: 400 },
      );
    }

    await connectToDatabase();
    await ensureWaterLevelCollection();

    const gallons =
      body?.gallons !== undefined && Number.isFinite(Number(body.gallons))
        ? Number(body.gallons)
        : calculateGallons(percentage);

    const created = await WaterLevel.create({
      percentage,
      gallons,
      raw_distance:
        body?.raw_distance !== undefined && Number.isFinite(Number(body.raw_distance))
          ? Number(body.raw_distance)
          : undefined,
      is_filling: Boolean(body?.is_filling),
      rssi: body?.rssi !== undefined && Number.isFinite(Number(body.rssi)) ? Number(body.rssi) : undefined,
      timestamp:
        body?.timestamp && !Number.isNaN(new Date(body.timestamp).getTime())
          ? new Date(body.timestamp)
          : undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        data: created,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/water-level failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save water level",
      },
      { status: 500 },
    );
  }
}
