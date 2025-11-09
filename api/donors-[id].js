// api/donors-[id].js
import { connectDB, Donor } from "./_db.js";

export default async function handler(req, res) {
  try {
    await connectDB();

    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "DELETE,OPTIONS");
      return res.status(204).end();
    }

    if (req.method === "DELETE") {
      const { id } = req.query; // file param
      await Donor.findByIdAndDelete(id);
      return res.status(204).end();
    }

    res.setHeader("Allow", "DELETE, OPTIONS");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("DELETE error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
