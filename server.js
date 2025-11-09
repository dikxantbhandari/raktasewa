// server.js (MongoDB version)
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// ---- MongoDB connection ----
mongoose.set("strictQuery", true);
mongoose
  .connect(MONGODB_URI, { dbName: process.env.DB_NAME || undefined })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ---- Mongoose schema & model ----
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

// Prevent duplicates by phone within the same district
donorSchema.index({ phone: 1, district: 1 }, { unique: true });

const Donor = mongoose.model("Donor", donorSchema);

// ---- Routes (same endpoints as before) ----

// GET /api/donors?blood_group=A+&district=Jhapa&q=text
app.get("/api/donors", async (req, res) => {
  try {
    const { blood_group, district, q } = req.query;

    const filter = {};
    if (blood_group) filter.blood_group = blood_group;
    if (district && district.trim())
      filter.district = new RegExp(district.trim(), "i");

    if (q && q.trim()) {
      const rx = new RegExp(q.trim(), "i");
      filter.$or = [{ name: rx }, { municipality: rx }, { ward: rx }];
    }

    const donors = await Donor.find(filter).sort({ _id: -1 }).lean();
    res.json(donors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch donors" });
  }
});

// POST /api/donors
app.post("/api/donors", async (req, res) => {
  try {
    const { name, blood_group, phone, district, municipality = "", ward = "" } =
      req.body;

    if (!name || !blood_group || !phone || !district) {
      return res
        .status(400)
        .json({ error: "name, blood_group, phone, district are required" });
    }
    if (!/^\+?\d[\d\s-]{6,}$/.test(String(phone))) {
      return res.status(400).json({ error: "Invalid phone" });
    }

    const doc = await Donor.create({
      name: String(name).trim(),
      blood_group,
      phone: String(phone).trim(),
      district: String(district).trim(),
      municipality: String(municipality || "").trim(),
      ward: String(ward || "").trim(),
    });

    res.status(201).json(doc);
  } catch (err) {
    // Duplicate phone+district
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ error: "A donor with this phone already exists in this district" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create donor" });
  }
});

// DELETE /api/donors/:id
app.delete("/api/donors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Donor.findByIdAndDelete(id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete donor" });
  }
});

// ---- Start server ----
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
