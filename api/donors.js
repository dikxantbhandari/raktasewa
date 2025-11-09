// api/donors.js
import { connectDB, Donor } from "./_db.js";

export default async function handler(req, res) {
  try {
    await connectDB();

    // CORS (safe on same domain, but harmless)
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    if (req.method === "GET") {
      const { blood_group, district, q } = req.query || {};
      const filter = {};
      if (blood_group) filter.blood_group = blood_group;
      if (district) filter.district = new RegExp(String(district).trim(), "i");
      if (q) {
        const rx = new RegExp(String(q).trim(), "i");
        filter.$or = [{ name: rx }, { municipality: rx }, { ward: rx }];
      }
      const donors = await Donor.find(filter).sort({ _id: -1 }).lean();
      return res.status(200).json(donors);
    }

    if (req.method === "POST") {
      const { name, blood_group, phone, district, municipality = "", ward = "" } =
        req.body || {};

      if (!name || !blood_group || !phone || !district) {
        return res
          .status(400)
          .json({ error: "name, blood_group, phone, district are required" });
      }

      if (!/^\+\d{7,15}$/.test(phone)) {
        return res.status(400).json({ error: "Invalid phone number format" });
      }

      try {
        const donor = await Donor.create({
          name,
          blood_group,
          phone,
          district,
          municipality,
          ward,
        });
        return res.status(201).json(donor);
      } catch (err) {
        if (err.code === 11000) {
          return res
            .status(409)
            .json({ error: "A donor with this phone already exists in this district" });
        }
        throw err;
      }
    }

    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
