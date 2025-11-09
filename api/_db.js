// api/_db.js
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

// Cache the connection across function invocations
if (!global._mongoose) {
  global._mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (global._mongoose.conn) return global._mongoose.conn;
  if (!global._mongoose.promise) {
    global._mongoose.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }
  global._mongoose.conn = await global._mongoose.promise;
  return global._mongoose.conn;
}

// Donor model (define once)
const donorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    blood_group: {
      type: String,
      required: true,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    },
    phone: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    municipality: { type: String, trim: true, default: "" },
    ward: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

donorSchema.index({ phone: 1, district: 1 }, { unique: true });

export const Donor =
  mongoose.models.Donor || mongoose.model("Donor", donorSchema);
