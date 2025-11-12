// api/ping.js
import { connectDB } from "./_db.js";

export default async function handler(req, res) {
  try {
    const conn = await connectDB();
    res.status(200).json({
      ok: true,
      env: !!process.env.MONGODB_URI,
      host: conn?.connection?.host || null,
      db: conn?.connection?.name || null,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      name: e?.name,
      message: e?.message,
      code: e?.code,
    });
  }
}
