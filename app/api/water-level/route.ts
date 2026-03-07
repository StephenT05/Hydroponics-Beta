import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import WaterLevel from "@/models/WaterLevel";
import { broadcastWaterLevel } from "@/lib/ws-server";

export const runtime = "nodejs";

const TANK_CAPACITY_GAL = Number(process.env.WATER_TANK_CAPACITY_GAL ?? 5.0);
const FULL_DISTANCE_IN = Number(process.env.WATER_FULL_DISTANCE_IN ?? 4.0);
const EMPTY_DISTANCE_IN = Number(process.env.WATER_EMPTY_DISTANCE_IN ?? 20.0);
const FLOW_ACTIVE_HIGH = process.env.WATER_FLOW_ACTIVE_HIGH !== "false";
const FLOW_ON_THRESHOLD = Number(process.env.WATER_FLOW_ON_THRESHOLD ?? 120);
const FLOW_OFF_THRESHOLD = Number(process.env.WATER_FLOW_OFF_THRESHOLD ?? 80);

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function calculateFromDistance(rawDistance: number) {
  const range = EMPTY_DISTANCE_IN - FULL_DISTANCE_IN;
  if (!Number.isFinite(rawDistance) || !Number.isFinite(range) || range <= 0 || TANK_CAPACITY_GAL <= 0) {
    return { percentage: 0, gallons: 0 };
  }

  // Calibration mapping: FULL_DISTANCE_IN -> 100%, EMPTY_DISTANCE_IN -> 0%.
  const normalized = clamp((EMPTY_DISTANCE_IN - rawDistance) / range, 0, 1);
  const percentage = Number((normalized * 100).toFixed(2));
  const gallons = Number((normalized * TANK_CAPACITY_GAL).toFixed(2));

  return { percentage, gallons };
}

function resolveFillingFromAnalog(rawAnalog: number, previousIsFilling: boolean) {
  if (!Number.isFinite(rawAnalog)) {
    return false;
  }

  // Hysteresis avoids flicker/noise when analog values hover near the threshold.
  if (FLOW_ACTIVE_HIGH) {
    return previousIsFilling
      ? rawAnalog >= FLOW_OFF_THRESHOLD
      : rawAnalog >= FLOW_ON_THRESHOLD;
  }

  return previousIsFilling
    ? rawAnalog <= FLOW_OFF_THRESHOLD
    : rawAnalog <= FLOW_ON_THRESHOLD;
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
    const rawAnalog = Number(body?.raw_analog);
    const rawDistance = Number(body?.raw_dist ?? body?.raw_distance);
    const sentValue = Number(body?.value);
    const sentPercentage = Number(body?.percentage);
    const hasRawDistance = Number.isFinite(rawDistance);
    const hasPercentage = Number.isFinite(sentPercentage) && sentPercentage >= 0;
    const hasValue = Number.isFinite(sentValue) && sentValue >= 0;

    if (!hasRawDistance && !hasPercentage && !hasValue) {
      return NextResponse.json(
        {
          ok: false,
          error: "Provide `raw_dist`/`raw_distance` or `value`/`percentage`",
        },
        { status: 400 },
      );
    }

    await connectToDatabase();
    await ensureWaterLevelCollection();

    const previous = await WaterLevel.findOne().sort({ timestamp: -1 }).lean();

    const derivedFromDistance = hasRawDistance
      ? calculateFromDistance(rawDistance)
      : null;

    const percentage = derivedFromDistance
      ? derivedFromDistance.percentage
      : hasValue
        ? Number(sentValue.toFixed(2))
      : Number(sentPercentage.toFixed(2));

    const gallons =
      body?.gallons !== undefined && Number.isFinite(Number(body.gallons))
        ? Number(body.gallons)
        : derivedFromDistance
          ? derivedFromDistance.gallons
          : 0;

    // Filling state is determined only by the dedicated flow sensor on A0.
    const isFilling = resolveFillingFromAnalog(rawAnalog, Boolean(previous?.is_filling));

    const created = await WaterLevel.create({
      percentage,
      gallons,
      raw_distance:
        hasRawDistance
          ? rawDistance
          : undefined,
      is_filling: isFilling,
      raw_analog:
        Number.isFinite(rawAnalog)
          ? rawAnalog
          : undefined,
      rssi: body?.rssi !== undefined && Number.isFinite(Number(body.rssi)) ? Number(body.rssi) : undefined,
      timestamp:
        body?.timestamp && !Number.isNaN(new Date(body.timestamp).getTime())
          ? new Date(body.timestamp)
          : undefined,
    });

    broadcastWaterLevel({
      percentage: created.percentage,
      gallons: created.gallons,
      raw_distance: created.raw_distance,
      is_filling: created.is_filling,
      rssi: created.rssi,
      timestamp: created.timestamp,
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
