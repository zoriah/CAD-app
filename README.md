# CAD Viewer Suite (Web + Mobile)

Eine **einheitliche Codebase** (React + Material Design) für:
- **Web App** (Browser)
- **Mobile App** (Android / iOS) via **Capacitor** (WebView) – funktioniert auch auf Xiaomi/neueren Androids.

## Features
- **Zusammenbauansicht** (Explode = 0)
- **Sprengansicht** (Explode = 1) mit Slider + Animation
- **WYSIWYG Editing**:
  - Teil auswählen (Tap/Click)
  - Move / Rotate / Scale (Transform Controls)
  - Reset Teil
  - Farbe für selektiertes Teil oder für alle Teile
- **Farbschemata** (UI Theme) via Material Design (MUI)

## Unterstützte Formate
- glTF/GLB (.gltf, .glb) inkl. Draco/Meshopt/KTX2 (wenn enthalten)
- OBJ/MTL (.obj + .mtl)
- STL (.stl)
- PLY (.ply)
- 3MF (.3mf)
- FBX (.fbx)
- DAE (.dae)
- STEP/IGES/BREP (.stp/.step, .igs/.iges, .brep/.brp) per **occt-import-js** (WASM, wird erst bei Bedarf geladen)

> Hinweis: native Solid Edge Formate (.par/.asm) sind im Browser üblicherweise nicht direkt ladbar → am besten in STEP oder GLB exportieren.

---

## 1) Web App starten (Dev)
Voraussetzung: Node.js 18+.

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:5174/api/health

In der App: oben rechts **Dateien laden**.

---

## 2) Production Build (Server liefert die Web App aus)
```bash
npm run build
npm start
```
Dann: http://localhost:5174

---

## 3) Mobile App (Android / iOS) via Capacitor
Die Mobile App nutzt die **gleiche Web App**.

### Android (Windows/Mac/Linux möglich)
```bash
cd client
npm install
npm run build
npm run cap:add:android
npm run cap:sync
npm run cap:open:android
```

### iOS (nur macOS)
```bash
cd client
npm install
npm run build
npm run cap:add:ios
npm run cap:sync
npm run cap:open:ios
```

---

## Performance Tipps (Mobile)
- Für Mobile: bevorzugt **GLB** mit moderater Polygonzahl.
- Texturen: möglichst komprimiert (KTX2/Basis) und nicht riesig.
- Große Baugruppen: in mehrere GLBs splitten und stückweise laden (kann ich als nächsten Schritt einbauen).


## ZIP Import
Die App kann jetzt **.zip** Dateien direkt laden (client-seitig entpackt via JSZip). Texturen/Sidecars werden automatisch aufgelöst.

## Lazy Load (Portfolio)
Die Web-App startet mit einer leichten Startseite. Der eigentliche CAD Viewer (three.js) wird erst beim Klick auf **Viewer öffnen** dynamisch nachgeladen (React.lazy).


## Demo-Model integriert
Im Ordner `client/public/demo/` liegt `cad_viewer_demo_parts_v3.zip`. In der Sidebar gibt es einen **Demo**-Button, der das ZIP lädt und entpackt.
Optional: Starte mit `?demo=1` in der URL, um die Demo automatisch zu laden.
