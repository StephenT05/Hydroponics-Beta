import { Schema, model, models, type InferSchemaType } from "mongoose";

const waterLevelSchema = new Schema(
  {
    // Filtered values from ESP8266 (Kalman Filter output)
    percentage: {
      type: Number,
      required: true,
      min: 0,
    },

    // Calculated on Backend (Volume)
    gallons: {
      type: Number,
      default: 0,
    },

    // Metadata for the "Triple Filter" / Debugging
    raw_distance: Number, // Raw inches from sensor before Kalman
    is_filling: {
      type: Boolean,
      default: false,
    },

    // Connection Quality
    rssi: Number, // WiFi Signal Strength (dBm)

    timestamp: {
      type: Date,
      default: Date.now,
      index: true, // Indexed for faster charts
    },
  },
  {
    collection: "water_levels",
  },
);

export type WaterLevelDocument = InferSchemaType<typeof waterLevelSchema>;

const WaterLevel = models.WaterLevel || model("WaterLevel", waterLevelSchema);

export default WaterLevel;
