// api/ping.js
import { connectDB } from "./_db.js";

export default async function handler(req, res) {
  try {
    await connectDB();
    res.status(200).json({ ok: true, env: !!process.env.MONGODB_URI });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
