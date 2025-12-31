import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import JSZip from "jszip";
import {
  AppBar, Box, Toolbar, Typography, IconButton, Button, Drawer, Divider,
  FormControlLabel, Switch, Slider, ToggleButton, ToggleButtonGroup,
  MenuItem, Select, Stack, Tooltip
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AutoAwesomeMotionIcon from "@mui/icons-material/AutoAwesomeMotion";
import ConstructionIcon from "@mui/icons-material/Construction";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import ThreeSixtyIcon from "@mui/icons-material/ThreeSixty";
import StraightenIcon from "@mui/icons-material/Straighten";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { HexColorPicker } from "react-colorful";
import ViewerCanvas from "./ViewerCanvas.jsx";

const drawerWidth = 360;

const BTN_SX = {
  px: 1.8,
  py: 1.05,
  fontSize: { xs: 12, sm: 13 },
  fontWeight: 700,
  textTransform: "none",
  minHeight: 40,
  whiteSpace: "nowrap",
};

const DEMO_ZIP_URL = `${import.meta.env.BASE_URL}demo/cad_viewer_demo_parts_v3.zip`;

const SCHEMES = [
  { id: "dark-ocean", name: "Dark Ocean", mode: "dark", primary: "#67b7ff", bg: "#0f1116" },
  { id: "dark-slate", name: "Dark Slate", mode: "dark", primary: "#a8ff60", bg: "#0e1115" },
  { id: "light-paper", name: "Light Paper", mode: "light", primary: "#1565c0", bg: "#f6f8fb" },
  { id: "sunset", name: "Sunset", mode: "dark", primary: "#ff8a65", bg: "#100f12" },
];

function extOf(name = "") {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function mimeFromExt(name = "") {
  const ext = extOf(name);
  switch (ext) {
    case "glb": return "model/gltf-binary";
    case "gltf": return "model/gltf+json";
    case "bin": return "application/octet-stream";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "ktx2": return "image/ktx2";
    case "basis": return "image/basis";
    case "hdr": return "application/octet-stream";
    case "exr": return "application/octet-stream";
    case "json": return "application/json";
    case "mtl": return "text/plain";
    case "obj": return "text/plain";
    default: return "";
  }
}

function isZipFile(file) {
  return file?.name?.toLowerCase().endsWith(".zip");
}

function isModelFile(name = "") {
  const ext = extOf(name);
  return ["glb","gltf","obj","stl","ply","3mf","fbx","dae","stp","step","igs","iges","brep","brp"].includes(ext);
}

function pickDefaultEntry(candidates = []) {
  if (!candidates.length) return "";
  const exactDemo = candidates.find(c => c.toLowerCase().endsWith("demo_assembly.glb"));
  if (exactDemo) return exactDemo;
  const assembly = candidates.find(c => c.toLowerCase().includes("assembly") && (c.toLowerCase().endsWith(".glb") || c.toLowerCase().endsWith(".gltf")));
  if (assembly) return assembly;
  const firstGlb = candidates.find(c => c.toLowerCase().endsWith(".glb"));
  return firstGlb || candidates[0];
}

export default function CadApp() {
  const fileInputRef = useRef(null);
  const [schemeId, setSchemeId] = useState("dark-ocean");
  const scheme = useMemo(() => SCHEMES.find(s => s.id === schemeId) || SCHEMES[0], [schemeId]);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: scheme.mode,
      primary: { main: scheme.primary },
      background: { default: scheme.bg, paper: scheme.mode === "dark" ? "#171c2b" : "#ffffff" }
    },
    shape: { borderRadius: 14 }
  }), [scheme]);

  // Viewer state
  const [files, setFiles] = useState([]);
  const [entryCandidates, setEntryCandidates] = useState([]);
  const [entryName, setEntryName] = useState("");

  const [explodeTarget, setExplodeTarget] = useState(0);        // 0..1
  const [explodeDistance, setExplodeDistance] = useState(0.25); // relative
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotateSpeed, setRotateSpeed] = useState(0.7); // rad/s
  const [playAnims, setPlayAnims] = useState(true);

  // WYSIWYG edit state
  const [transformMode, setTransformMode] = useState("translate"); // translate|rotate|scale
  const [selectedColor, setSelectedColor] = useState("#ffcc80");
  const [applyToAll, setApplyToAll] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(true);

// Optional: Auto-load demo when URL contains ?demo=1
useEffect(() => {
  const qs = new URLSearchParams(window.location.search);
  if (qs.get("demo") === "1" && !files.length) {
    loadDemo();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  const handlePickFiles = () => fileInputRef.current?.click();

  const unpackZips = async (zipFiles) => {
    const extracted = [];
    for (const zf of zipFiles) {
      try {
        const ab = await zf.arrayBuffer();
        const zip = await JSZip.loadAsync(ab);
        const entries = Object.values(zip.files).filter(x => !x.dir);
        for (const entry of entries) {
          const blob = await entry.async("blob");
          const type = mimeFromExt(entry.name) || blob.type || "";
          extracted.push(new File([blob], entry.name, { type }));
        }
      } catch (err) {
        console.error("ZIP unpack failed:", err);
      }
    }
    return extracted;
  };


const loadDemo = useCallback(async () => {
  try {
    const res = await fetch(DEMO_ZIP_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Demo download failed: ${res.status}`);
    const ab = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(ab);
    const entries = Object.values(zip.files).filter(x => !x.dir);

    const extracted = [];
    for (const entry of entries) {
      const blob = await entry.async("blob");
      const type = mimeFromExt(entry.name) || blob.type || "";
      extracted.push(new File([blob], entry.name, { type }));
    }

    setAllFiles(extracted);
    setExplodeTarget(0);
  } catch (err) {
    console.error(err);
    alert("Demo konnte nicht geladen werden. Prüfe client/public/demo/cad_viewer_demo_parts_v3.zip");
  }
}, []);


  const setAllFiles = (all) => {
    setFiles(all);
    const candidates = all.map(f => f.name).filter(isModelFile);
    setEntryCandidates(candidates);
    setEntryName((prev) => prev || pickDefaultEntry(candidates));
  };

  const onFilesChosen = useCallback(async (e) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = "";
    if (!chosen.length) return;

    const normalFiles = chosen.filter(f => !isZipFile(f));
    const zipFiles = chosen.filter(isZipFile);

    const extracted = zipFiles.length ? await unpackZips(zipFiles) : [];
    setAllFiles([...extracted, ...normalFiles]);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropped = Array.from(e.dataTransfer?.files || []);
    if (!dropped.length) return;
    await onFilesChosen({ target: { files: dropped, value: "" } });
  }, [onFilesChosen]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const supportedHint = useMemo(() => {
    if (!files.length) return "Noch keine Datei gewählt. (Du kannst auch .zip droppen)";
    const primary = files[0];
    return `${files.length} Datei(en) bereit – z. B. ${primary.name} (.${extOf(primary.name)})`;
  }, [files]);

  const handleExplode = () => setExplodeTarget(1);
  const handleAssemble = () => setExplodeTarget(0);

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ height: "100dvh", bgcolor: "background.default" }}>
        <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
          <Toolbar sx={{ gap: 1 }}>
            <Typography variant="h6" noWrap sx={{ flexGrow: 1, fontWeight: 800, fontSize: { xs: 14, sm: 18 } }}>
              CAD Viewer – Spreng & WYSIWYG
            </Typography>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={onFilesChosen}
              accept=".zip,.glb,.gltf,.obj,.mtl,.stl,.ply,.3mf,.fbx,.dae,.stp,.step,.igs,.iges,.brep,.brp"
            />

            <Tooltip title="Dateien laden (auch ZIP)">
              <IconButton color="primary" onClick={handlePickFiles}>
                <UploadFileIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Sidebar ein/aus">
              <Button variant="outlined" onClick={() => setDrawerOpen(v => !v)} sx={BTN_SX}>
                Tools
              </Button>
            </Tooltip>
          </Toolbar>
        </AppBar>

        <Box sx={{ display: "flex", height: "calc(100dvh - 64px)" }}>
          <Drawer
            variant="persistent"
            anchor="left"
            open={drawerOpen}
            sx={{
              width: drawerWidth,
              flexShrink: 0,
              "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box" }
            }}
          >
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Import</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {supportedHint}
              </Typography>

              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                <Button fullWidth variant="contained" onClick={handlePickFiles} startIcon={<UploadFileIcon />} sx={BTN_SX}>
                  Laden
                </Button>
                <Button fullWidth variant="outlined" onClick={loadDemo} startIcon={<PlayArrowIcon />} sx={BTN_SX}>
                  Demo
                </Button>
              </Stack>

              {entryCandidates.length > 1 && (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2 }}>
                    Model Entry
                  </Typography>
                  <Select
                    size="small"
                    fullWidth
                    value={entryName || ""}
                    onChange={(e) => setEntryName(e.target.value)}
                    sx={{ mt: 0.5 }}
                  >
                    {entryCandidates.map((c) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </Select>
                </>
              )}

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Ansicht</Typography>

              <Stack direction="row" spacing={1} sx={{ mt: 1.2 }}>
                <Button fullWidth variant="outlined" onClick={handleAssemble} startIcon={<ConstructionIcon />} sx={BTN_SX}>
                  Zusammenbau
                </Button>
                <Button fullWidth variant="contained" onClick={handleExplode} startIcon={<AutoAwesomeMotionIcon />} sx={BTN_SX}>
                  Spreng
                </Button>
              </Stack>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2 }}>
                Sprengfaktor
              </Typography>
              <Slider value={explodeTarget} min={0} max={1} step={0.01} onChange={(_, v) => setExplodeTarget(Number(v))} />

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2 }}>
                Spreng-Distanz
              </Typography>
              <Slider value={explodeDistance} min={0.05} max={0.8} step={0.01} onChange={(_, v) => setExplodeDistance(Number(v))} />

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Animation</Typography>
              <FormControlLabel control={<Switch checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />} label="Auto-Rotation" />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Speed
              </Typography>
              <Slider value={rotateSpeed} min={0} max={2.5} step={0.05} onChange={(_, v) => setRotateSpeed(Number(v))} />
              <FormControlLabel control={<Switch checked={playAnims} onChange={(e) => setPlayAnims(e.target.checked)} />} label="glTF-Animationen" />

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>WYSIWYG</Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Transform
              </Typography>
              <ToggleButtonGroup value={transformMode} exclusive onChange={(_, v) => v && setTransformMode(v)} sx={{ mt: 0.5 }} fullWidth>
                <ToggleButton
                  value="translate"
                  sx={{ px: 1.2, py: 0.9, fontSize: { xs: 11, sm: 12 }, textTransform: "none" }}
                >
                  <OpenWithIcon sx={{ mr: 0.7 }} />Move
                </ToggleButton>
                <ToggleButton
                  value="rotate"
                  sx={{ px: 1.2, py: 0.9, fontSize: { xs: 11, sm: 12 }, textTransform: "none" }}
                >
                  <ThreeSixtyIcon sx={{ mr: 0.7 }} />Rotate
                </ToggleButton>
                <ToggleButton
                  value="scale"
                  sx={{ px: 1.2, py: 0.9, fontSize: { xs: 11, sm: 12 }, textTransform: "none" }}
                >
                  <StraightenIcon sx={{ mr: 0.7 }} />Scale
                </ToggleButton>
              </ToggleButtonGroup>

              <Stack direction="row" spacing={1} sx={{ mt: 1.2 }}>
                <Button fullWidth variant="outlined" startIcon={<RestartAltIcon />} onClick={() => window.dispatchEvent(new CustomEvent("cadviewer:resetSelected"))} sx={BTN_SX}>
                  Reset
                </Button>
                <Button fullWidth variant="outlined" startIcon={<CenterFocusStrongIcon />} onClick={() => window.dispatchEvent(new CustomEvent("cadviewer:fit"))} sx={BTN_SX}>
                  Fit
                </Button>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Farben & UI</Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                UI Schema
              </Typography>
              <Select size="small" fullWidth value={schemeId} onChange={(e) => setSchemeId(e.target.value)} sx={{ mt: 0.5 }}>
                {SCHEMES.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Bauteil-Farbe
              </Typography>
              <Box sx={{ mt: 0.8 }}>
                <HexColorPicker color={selectedColor} onChange={setSelectedColor} />
              </Box>

              <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />} label="Auf alle Teile" />

              <Button
                variant="contained"
                fullWidth
                startIcon={<ColorLensIcon />}
                sx={{ ...BTN_SX, mt: 1 }}
                onClick={() => window.dispatchEvent(new CustomEvent("cadviewer:applyColor", { detail: { color: selectedColor, all: applyToAll } }))}
              >
                Farbe
              </Button>

              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Tipp: Teil antippen, dann Move/Rotate/Scale.
              </Typography>
            </Box>
          </Drawer>

          <Box
            sx={{ flexGrow: 1, position: "relative" }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <ViewerCanvas
              files={files}
              entryName={entryName}
              explodeTarget={explodeTarget}
              explodeDistance={explodeDistance}
              autoRotate={autoRotate}
              rotateSpeed={rotateSpeed}
              playAnims={playAnims}
              transformMode={transformMode}
            />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
