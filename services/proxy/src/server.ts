import "dotenv/config";
import express from "express";
import cors from "cors";
import { proxyRouter } from "./routes/proxy";

const app = express();

// Body parsers
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS solo para /proxy/* (ajusta origin según tu frontend)
app.use(
  "/proxy",
  cors({
    origin: (origin, cb) => cb(null, true), // ⚠️ abre todo — restringe en producción
    credentials: false,
  })
);

// Rate limit básico (in-memory) — opcional
if (process.env.ENABLE_RATE_LIMIT === "1") {
  const windowMs = Number(process.env.RL_WINDOW_MS ?? 15000);
  const max = Number(process.env.RL_MAX ?? 60);
  const hits = new Map<string, { count: number; reset: number }>();

  app.use("/proxy", (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || now > rec.reset) {
      hits.set(ip, { count: 1, reset: now + windowMs });
      return next();
    }
    if (rec.count >= max) {
      res.status(429).json({ error: "Too many requests" });
    } else {
      rec.count++;
      next();
    }
  });

  // Limpieza periódica
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits.entries()) if (now > v.reset) hits.delete(k);
  }, windowMs).unref();
}

// Rutas del proxy
app.use("/proxy", proxyRouter);

// Salud
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => {
  console.log(`Proxy multi-LLM listo en http://localhost:${PORT}`);
});

