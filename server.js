// server.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// UI on :3000 (Vite/React/static), API on :5000
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET","POST","DELETE","OPTIONS"],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT        = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// Toggle exposing real phone to the client (for direct call/SMS).
// Set EXPOSE_PHONE=false in production to hide it.
const EXPOSE_PHONE = (process.env.EXPOSE_PHONE ?? "true").toLowerCase() === "true";

/* ---------------- MongoDB ---------------- */
mongoose.set("strictQuery", true);
await mongoose.connect(MONGODB_URI, { dbName: process.env.DB_NAME || undefined });
console.log("✅ Connected to MongoDB");

/* ---------------- Model ------------------ */
const donorSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  blood_group:  { type: String, required: true, enum: ["A+","A-","B+","B-","AB+","AB-","O+","O-"] },
  phone:        { type: String, required: true, trim: true },
  district:     { type: String, required: true, trim: true },
  municipality: { type: String, trim: true, default: "" },
  ward:         { type: String, trim: true, default: "" },
}, { timestamps: true });

donorSchema.index({ phone: 1, district: 1 }, { unique: true });
const Donor = mongoose.model("Donor", donorSchema);

// helper to mask phone when listing
const maskPhone = (p = "") => {
  const d = String(p).replace(/[^\d]/g, "");
  if (d.length < 4) return "hidden";
  return `${d.slice(0,2)}${"*".repeat(Math.max(0, d.length-3))}${d.slice(-1)}`;
};

/* ---------------- Routes ----------------- */

// health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// GET /api/donors?blood_group=&district=&q=
app.get("/api/donors", async (req, res) => {
  try {
    const { blood_group, district, q } = req.query;
    const filter = {};
    if (blood_group) filter.blood_group = blood_group;
    if (district?.trim()) filter.district = new RegExp(district.trim(), "i");
    if (q?.trim()) {
      const rx = new RegExp(q.trim(), "i");
      filter.$or = [{ name: rx }, { municipality: rx }, { ward: rx }];
    }

    const donors = await Donor.find(filter).sort({ _id: -1 }).lean();

    // Return masked + (optionally) real phone
    const out = donors.map(d => ({
      _id:         d._id,
      name:        d.name,
      blood_group: d.blood_group,
      district:    d.district,
      municipality:d.municipality,
      ward:        d.ward,
      createdAt:   d.createdAt,
      updatedAt:   d.updatedAt,
      phone_masked: maskPhone(d.phone),
      ...(EXPOSE_PHONE ? { phone: d.phone } : {})   // <-- real phone exposed when allowed
    }));

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch donors" });
  }
});

// POST /api/donors
app.post("/api/donors", async (req, res) => {
  try {
    const { name, blood_group, phone, district, municipality = "", ward = "" } = req.body || {};
    if (!name || !blood_group || !phone || !district) {
      return res.status(400).json({ error: "name, blood_group, phone, district are required" });
    }
    if (!/^\+?\d[\d\s-]{6,}$/.test(String(phone))) {
      return res.status(400).json({ error: "Invalid phone" });
    }
    const doc = await Donor.create({
      name: name.trim(),
      blood_group,
      phone: String(phone).trim(),
      district: district.trim(),
      municipality: String(municipality || "").trim(),
      ward: String(ward || "").trim(),
    });
    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "A donor with this phone already exists in this district" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create donor" });
  }
});

// DELETE /api/donors/:id
app.delete("/api/donors/:id", async (req, res) => {
  try {
    await Donor.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete donor" });
  }
});

/* -------- Twilio (optional) + /api/contact -------- */
let twilioClient = null;
if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
  const Twilio = (await import("twilio")).default;
  twilioClient = new Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  console.log("✉️  Twilio client ready");
} else {
  console.log("✉️  Twilio NOT configured — will return deep links only.");
}

/**
 * POST /api/contact
 * Body: { donorId, requesterName, requesterPhone, message? }
 * If Twilio is configured, relays an SMS to the donor (their number stays hidden).
 * Always returns 200 on success with optional mobile deep-link URIs.
 */
app.post("/api/contact", async (req, res) => {
  try {
    const { donorId, requesterName, requesterPhone, message = "" } = req.body || {};
    if (!donorId || !requesterName || !requesterPhone) {
      return res.status(400).json({ error: "donorId, requesterName, requesterPhone required" });
    }

    if (!mongoose.isValidObjectId(donorId)) {
      return res.status(400).json({ error: "Invalid donorId" });
    }

    const donor = await Donor.findById(donorId).lean();
    if (!donor) return res.status(404).json({ error: "Donor not found" });

    const smsBody =
      `RaktaSewa: ${requesterName} (${requesterPhone}) is requesting blood (${donor.blood_group}).` +
      (message ? ` Msg: "${message}"` : "");

    let relayed = false;
    if (twilioClient && process.env.TWILIO_FROM) {
      try {
        await twilioClient.messages.create({
          to: donor.phone,
          from: process.env.TWILIO_FROM,
          body: smsBody,
        });
        relayed = true;
      } catch (twErr) {
        console.error("Twilio send error:", twErr?.message || twErr);
        return res.status(502).json({
          error: "SMS relay failed (Twilio).",
          details: twErr?.message || String(twErr),
          relayed: false,
        });
      }
    } else {
      console.log("[SIMULATED SMS]", { to: donor.phone, body: smsBody });
    }

    // deep-links for optional mobile UX
    const enc = encodeURIComponent(smsBody);
    const smsLink   = `sms:${donor.phone}?body=${enc}`; // Android
    const smstoLink = `sms:${donor.phone}&body=${enc}`; // iOS variants

    res.json({ ok: true, relayed, smsLink, smstoLink });
  } catch (err) {
    console.error("💥 /api/contact error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => console.log(`🚀 API running at http://localhost:${PORT}`));
