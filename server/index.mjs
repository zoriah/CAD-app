import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Serve built client (if present)
const distPath = path.resolve(__dirname, "../client/dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
} else {
  app.get("/", (req, res) => {
    res.type("text/plain").send(
`CAD Viewer Server läuft.

Dev:
- Client:  http://localhost:5173
- Server:  http://localhost:5174/api/health

Build:
- Baue zuerst den Client (npm run build im Root), dann liefert der Server /client/dist aus.`
    );
  });
}

const PORT = process.env.PORT || 5174;
app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
