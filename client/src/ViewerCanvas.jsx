import React, { useEffect, useRef, useState, Suspense, useCallback } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import TWEEN from "@tweenjs/tween.js";

const CLIP_NORMALS = {
  "+x": new THREE.Vector3(1, 0, 0),
  "-x": new THREE.Vector3(-1, 0, 0),
  "+y": new THREE.Vector3(0, 1, 0),
  "-y": new THREE.Vector3(0, -1, 0),
  "+z": new THREE.Vector3(0, 0, 1),
  "-z": new THREE.Vector3(0, 0, -1),
};

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const CAD_EXTS = new Set(["stp","step","igs","iges","brep","brp"]);

function normalizePath(p = "") {
  try {
    const s = decodeURIComponent(String(p));
    const noQuery = s.split("?")[0].split("#")[0];
    const fixed = noQuery.replace(/\\/g, "/");
    return fixed.replace(/^\.\//, "").replace(/^\//, "");
  } catch {
    const fixed = String(p).split("?")[0].split("#")[0].replace(/\\/g, "/");
    return fixed.replace(/^\.\//, "").replace(/^\//, "");
  }
}

function pickEntry(files, entryName = "") {
  if (!files?.length) return null;

  if (entryName) {
    const wanted = normalizePath(entryName).toLowerCase();
    const exact = files.find(f => normalizePath(f.name).toLowerCase() === wanted);
    if (exact) return exact;

    // basename match fallback
    const baseWanted = wanted.split("/").pop();
    const baseHit = files.find(f => normalizePath(f.name).toLowerCase().split("/").pop() === baseWanted);
    if (baseHit) return baseHit;
  }

  // Prefer "assembly" GLB/GLTF
  const assembly = files.find(f => {
    const n = normalizePath(f.name).toLowerCase();
    return n.includes("assembly") && (n.endsWith(".glb") || n.endsWith(".gltf"));
  });
  if (assembly) return assembly;

  const prio = [".glb",".gltf",".obj",".stl",".ply",".3mf",".fbx",".dae",".stp",".step",".igs",".iges",".brep",".brp"];
  for (const p of prio) {
    const f = files.find(x => normalizePath(x.name).toLowerCase().endsWith(p));
    if (f) return f;
  }
  return files[0] || null;
}

function makeResolver(files) {
  const map = new Map();
  const urls = [];
  for (const f of files) {
    const url = URL.createObjectURL(f);
    urls.push(url);

    const k1 = normalizePath(f.name);
    const k2 = k1.toLowerCase();
    const base = k1.split("/").pop();
    const baseLower = base.toLowerCase();

    map.set(k1, url);
    map.set(k2, url);
    map.set(base, url);
    map.set(baseLower, url);
  }

  const urlModifier = (url) => {
    const key = normalizePath(url);
    const keyLower = key.toLowerCase();
    const base = key.split("/").pop();
    const baseLower = base.toLowerCase();
    return map.get(key) || map.get(keyLower) || map.get(base) || map.get(baseLower) || url;
  };

  return { map, urlModifier, revoke: () => urls.forEach(u => URL.revokeObjectURL(u)) };
}

// CAD import via occt-import-js (WASM) - lazy-loaded
async function loadOcct() {
  if (window.__occtPromise) return window.__occtPromise;
  window.__occtPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/occt-import-js/dist/occt-import-js.js";
    script.async = true;
    script.onload = () => {
      if (typeof window.occtimportjs !== "function") return reject(new Error("occtimportjs() missing"));
      window.occtimportjs().then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error("Failed to load occt-import-js"));
    document.head.appendChild(script);
  });
  return window.__occtPromise;
}
function flattenMaybe(arr) { if (!arr) return []; return Array.isArray(arr[0]) ? arr.flat() : arr; }

function makeMeshFromOcctMesh(m) {
  const pos = new Float32Array(flattenMaybe(m.attributes?.position?.array));
  const norSrc = m.attributes?.normal?.array;
  const nor = norSrc ? new Float32Array(flattenMaybe(norSrc)) : null;
  const idx = new Uint32Array(flattenMaybe(m.index?.array));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (nor) geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (!nor) geo.computeVertexNormals();

  const c = m.color || null;
  const mat = new THREE.MeshStandardMaterial({
    color: c ? new THREE.Color(c[0], c[1], c[2]) : new THREE.Color(0.82, 0.84, 0.88),
    roughness: 0.65, metalness: 0.15
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = m.name || "cad_mesh";
  return mesh;
}
function buildOcctNode(node, meshes) {
  const group = new THREE.Group();
  group.name = node.name || "node";
  (node.meshes || []).forEach(i => { const m = meshes[i]; if (m) group.add(makeMeshFromOcctMesh(m)); });
  (node.children || []).forEach(ch => group.add(buildOcctNode(ch, meshes)));
  return group;
}
function cadParams(q = 0.45) {
  const linearDeflection = 0.003 + (1 - q) * 0.02;
  const angularDeflection = 0.3 + (1 - q) * 0.9;
  return { linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio", linearDeflection, angularDeflection };
}
async function loadCAD(file, ext) {
  const occt = await loadOcct();
  const buf = new Uint8Array(await file.arrayBuffer());
  const params = cadParams(0.45);
  let result;
  if (ext === "stp" || ext === "step") result = occt.ReadStepFile(buf, params);
  else if (ext === "igs" || ext === "iges") result = occt.ReadIgesFile(buf, params);
  else if (ext === "brep" || ext === "brp") result = occt.ReadBrepFile(buf, params);
  else throw new Error("Unsupported CAD: " + ext);
  if (!result || !result.success) throw new Error("CAD import failed");
  return buildOcctNode(result.root, result.meshes);
}

async function loadObjectFromFiles(files, renderer, entryName = "") {
  const resolver = makeResolver(files);
  const entry = pickEntry(files, entryName);
  if (!entry) return { object: null, revoke: resolver.revoke };

  const lower = normalizePath(entry.name).toLowerCase();
  const ext = lower.split(".").pop();
  const url = resolver.map.get(normalizePath(entry.name)) || resolver.map.get(normalizePath(entry.name).toLowerCase());

  const manager = new THREE.LoadingManager();
  manager.setURLModifier(resolver.urlModifier);

  // GLTF: Draco/Meshopt/KTX2
  const gltfLoader = new GLTFLoader(manager);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  const ktx2Loader = new KTX2Loader(manager);
  ktx2Loader.setTranscoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/");
  ktx2Loader.detectSupport(renderer);
  gltfLoader.setKTX2Loader(ktx2Loader);

  if (lower.endsWith(".glb") || lower.endsWith(".gltf")) {
    const gltf = await new Promise((resolve, reject) => gltfLoader.load(url, resolve, undefined, reject));
    gltf.scene.userData.__gltfAnimations = gltf.animations || [];
    return { object: gltf.scene, revoke: resolver.revoke, label: entry.name };
  }

  if (lower.endsWith(".obj")) {
    const mtlFile = files.find(f => normalizePath(f.name).toLowerCase().endsWith(".mtl"));
    if (mtlFile) {
      const mtlURL = resolver.map.get(normalizePath(mtlFile.name)) || resolver.map.get(normalizePath(mtlFile.name).toLowerCase());
      const mats = await new Promise((resolve, reject) => {
        const mtlLoader = new MTLLoader(manager);
        mtlLoader.load(mtlURL, (m) => { m.preload(); resolve(m); }, undefined, reject);
      });
      const objLoader = new OBJLoader(manager);
      objLoader.setMaterials(mats);
      const obj = await new Promise((resolve, reject) => objLoader.load(url, resolve, undefined, reject));
      return { object: obj, revoke: resolver.revoke, label: entry.name };
    }
    const objLoader = new OBJLoader(manager);
    const obj = await new Promise((resolve, reject) => objLoader.load(url, resolve, undefined, reject));
    return { object: obj, revoke: resolver.revoke, label: entry.name };
  }

  if (lower.endsWith(".stl")) {
    const geo = await new Promise((resolve, reject) => {
      const loader = new STLLoader(manager);
      loader.load(url, resolve, undefined, reject);
    });
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.15 }));
    mesh.name = entry.name;
    return { object: mesh, revoke: resolver.revoke, label: entry.name };
  }

  if (lower.endsWith(".ply")) {
    const geo = await new Promise((resolve, reject) => {
      const loader = new PLYLoader(manager);
      loader.load(url, resolve, undefined, reject);
    });
    geo.computeVertexNormals();
    const hasColors = !!geo.getAttribute("color");
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.1, vertexColors: hasColors }));
    mesh.name = entry.name;
    return { object: mesh, revoke: resolver.revoke, label: entry.name };
  }

  if (lower.endsWith(".3mf")) {
    const obj = await new Promise((resolve, reject) => {
      const loader = new ThreeMFLoader(manager);
      loader.load(url, resolve, undefined, reject);
    });
    return { object: obj, revoke: resolver.revoke, label: entry.name };
  }

  if (lower.endsWith(".fbx")) {
    const obj = await new Promise((resolve, reject) => {
      const loader = new FBXLoader(manager);
      loader.load(url, resolve, undefined, reject);
    });
    return { object: obj, revoke: resolver.revoke, label: entry.name };
  }

  if (lower.endsWith(".dae")) {
    const dae = await new Promise((resolve, reject) => {
      const loader = new ColladaLoader(manager);
      loader.load(url, resolve, undefined, reject);
    });
    return { object: dae.scene, revoke: resolver.revoke, label: entry.name };
  }

  if (CAD_EXTS.has(ext)) {
    const obj = await loadCAD(entry, ext);
    return { object: obj, revoke: resolver.revoke, label: entry.name };
  }

  throw new Error("Unsupported file type: " + entry.name);
}

function useGlobalEvents({ onFit, onResetSelected, onApplyColor }) {
  useEffect(() => {
    const fit = () => onFit?.();
    const reset = () => onResetSelected?.();
    const apply = (e) => onApplyColor?.(e?.detail);
    window.addEventListener("cadviewer:fit", fit);
    window.addEventListener("cadviewer:resetSelected", reset);
    window.addEventListener("cadviewer:applyColor", apply);
    return () => {
      window.removeEventListener("cadviewer:fit", fit);
      window.removeEventListener("cadviewer:resetSelected", reset);
      window.removeEventListener("cadviewer:applyColor", apply);
    };
  }, [onFit, onResetSelected, onApplyColor]);
}

function SceneContent({ files, entryName, explodeTarget, explodeDistance, horizontalExplode, autoRotate, rotateSpeed, playAnims, transformMode, clipEnabled, clipDirection, clipOffset }) {
  const { camera, gl, invalidate } = useThree();
  const orbit = useRef();
  const transform = useRef();
  const root = useRef();
  const clipPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const clipHelperRef = useRef(null);

  const [obj, setObj] = useState(null);
  const [parts, setParts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mixer, setMixer] = useState(null);

  const explodeRef = useRef({ current: 0, target: explodeTarget });
  useEffect(() => { explodeRef.current.target = explodeTarget; }, [explodeTarget]);
  const explodeLayoutRef = useRef({ spacing: 0 });

  useEffect(() => {
    gl.localClippingEnabled = true;
    return () => { gl.localClippingEnabled = false; };
  }, [gl]);

  useEffect(() => {
    let revoke = null;
    let alive = true;

    async function run() {
      setSelected(null);
      setMixer(null);
      setObj(null);
      setParts([]);

      if (!files?.length) return;

      const res = await loadObjectFromFiles(files, gl, entryName);
      revoke = res.revoke;
      if (!alive) { revoke?.(); return; }

      const object = res.object;
      const group = new THREE.Group();
      group.name = "modelRoot";
      group.add(object);

      // Center at origin
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      group.position.sub(center);

      const meshes = [];
      group.traverse((o) => { if (o.isMesh) meshes.push(o); });

      const inv = new THREE.Matrix4();
      meshes.forEach((m) => {
        m.userData.__basePosition = m.position.clone();
        m.userData.__baseQuaternion = m.quaternion.clone();
        m.userData.__baseScale = m.scale.clone();

        const wp = new THREE.Vector3();
        m.getWorldPosition(wp);
        const dirWorld = wp.clone();
        if (dirWorld.lengthSq() < 1e-6) dirWorld.set(1,0,0);
        dirWorld.normalize();

        inv.copy(m.parent.matrixWorld).invert();
        const localDir = dirWorld.clone().transformDirection(inv).normalize();
        m.userData.__radialDir = localDir.clone();
        m.userData.__explodeDir = localDir.clone();
        m.userData.__explodeIndex = 1;
      });

      // glTF animations (if present)
      const clips = object?.userData?.__gltfAnimations || [];
      if (clips.length) {
        const mix = new THREE.AnimationMixer(group);
        clips.forEach((c) => mix.clipAction(c).play());
        setMixer(mix);
      } else {
        setMixer(null);
      }

      setObj(group);
      setParts(meshes);
      invalidate();
    }

    run().catch(console.error);
    return () => {
      alive = false;
      revoke?.();
    };
  }, [files, entryName, gl, invalidate]);

  // Mount/unmount model to root group
  useEffect(() => {
    if (!root.current) return;
    root.current.clear();
    if (obj) root.current.add(obj);
    if (clipHelperRef.current) root.current.add(clipHelperRef.current);
    invalidate();
  }, [obj, invalidate]);

  const fit = useCallback(() => {
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const dist = maxSize / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
    const dir = new THREE.Vector3(1, 0.8, 1).normalize();
    camera.position.copy(center).add(dir.multiplyScalar(dist * 1.2));
    camera.near = dist / 100;
    camera.far = dist * 100;
    camera.updateProjectionMatrix();
    if (orbit.current) {
      orbit.current.target.copy(center);
      orbit.current.update();
    }
    invalidate();
  }, [obj, camera, invalidate]);

  const resetSelected = useCallback(() => {
    if (!selected) return;
    if (selected.userData.__basePosition) selected.position.copy(selected.userData.__basePosition);
    if (selected.userData.__baseQuaternion) selected.quaternion.copy(selected.userData.__baseQuaternion);
    if (selected.userData.__baseScale) selected.scale.copy(selected.userData.__baseScale);
    invalidate();
  }, [selected, invalidate]);

  const applyColor = useCallback((detail) => {
    if (!detail?.color) return;
    const color = new THREE.Color(detail.color);
    const all = !!detail.all;

    const applyToMesh = (mesh) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => { if (m?.color) m.color.copy(color); });
    };

    if (all) parts.forEach(applyToMesh);
    else if (selected?.isMesh) applyToMesh(selected);

    invalidate();
  }, [parts, selected, invalidate]);

  useGlobalEvents({ onFit: fit, onResetSelected: resetSelected, onApplyColor: applyColor });

  useEffect(() => {
    if (clipHelperRef.current || !root.current) return;
    clipHelperRef.current = new THREE.PlaneHelper(clipPlaneRef.current, 1, 0xff5577);
    clipHelperRef.current.visible = false;
    root.current.add(clipHelperRef.current);
  }, []);

  // Orbit disable while transforming
  useEffect(() => {
    if (!transform.current) return;
    const tc = transform.current;
    const onDrag = (e) => { if (orbit.current) orbit.current.enabled = !e.value; };
    tc.addEventListener("dragging-changed", onDrag);
    return () => tc.removeEventListener("dragging-changed", onDrag);
  }, []);

  // Highlight selection
  useEffect(() => {
    parts.forEach((m) => {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => {
        if (!mat?.emissive) return;
        if (m === selected) {
          mat.emissive.setHex(0x223355);
          mat.emissiveIntensity = 0.65;
        } else {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0.0;
        }
      });
    });
    invalidate();
  }, [selected, parts, invalidate]);

  const onPointerDown = (e) => {
    e.stopPropagation();
    if (e.object?.isMesh) setSelected(e.object);
  };
  const onMiss = () => setSelected(null);

  const updateExplodeLayout = useCallback(() => {
    const targetGroup = obj || root.current;
    if (!parts.length || !targetGroup) return;
    const box = new THREE.Box3().setFromObject(targetGroup);
    explodeLayoutRef.current.spacing = Math.max(box.getSize(new THREE.Vector3()).length() * explodeDistance, 0.001);

    if (horizontalExplode) {
      const axis = new THREE.Vector3(1, 0, 0);
      const ordered = parts.map((m, idx) => {
        const center = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
        return { m, idx, v: center.dot(axis) };
      }).sort((a, b) => (a.v - b.v) || (a.idx - b.idx));
      const centerOffset = (ordered.length - 1) / 2;
      ordered.forEach((entry, order) => {
        entry.m.userData.__explodeDir = axis.clone();
        entry.m.userData.__explodeIndex = order - centerOffset;
      });
    } else {
      parts.forEach((m) => {
        m.userData.__explodeDir = (m.userData.__radialDir || new THREE.Vector3(1, 0, 0)).clone();
        m.userData.__explodeIndex = 1;
      });
    }
  }, [explodeDistance, horizontalExplode, obj, parts]);

  useEffect(() => {
    updateExplodeLayout();
  }, [updateExplodeLayout]);

  useEffect(() => {
    const targetGroup = obj || root.current;
    if (!parts.length || !targetGroup) return;
    const box = new THREE.Box3().setFromObject(targetGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const normalBase = CLIP_NORMALS[clipDirection] || CLIP_NORMALS["+z"];
    const normal = normalBase.clone().normalize();

    const axisLen = Math.max(
      Math.abs(normal.x) ? size.x : 0,
      Math.abs(normal.y) ? size.y : 0,
      Math.abs(normal.z) ? size.z : 0,
      0.001
    );
    const offset = clipOffset * axisLen * 0.5;
    const origin = center.clone().addScaledVector(normal, offset);

    clipPlaneRef.current.setFromNormalAndCoplanarPoint(normal, origin);

    const applyPlane = (mesh) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const prepared = mats.map((m) => {
        if (!m) return m;
        if (!m.userData.__clonedForClipping) {
          const clone = m.clone();
          clone.userData.__clonedForClipping = true;
          return clone;
        }
        return m;
      });
      if (Array.isArray(mesh.material)) mesh.material = prepared;
      else mesh.material = prepared[0];

      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mat) => {
        if (!mat) return;
        mat.clippingPlanes = clipEnabled ? [clipPlaneRef.current] : [];
        mat.clipShadows = clipEnabled;
      });
    };

    parts.forEach(applyPlane);

    if (clipHelperRef.current) {
      clipHelperRef.current.visible = clipEnabled;
      clipHelperRef.current.plane = clipPlaneRef.current;
      clipHelperRef.current.size = size.length() * 0.6;
      clipHelperRef.current.updateMatrixWorld(true);
    }
  }, [clipDirection, clipEnabled, clipOffset, obj, parts, root]);

  useFrame((state, dt) => {
    TWEEN.update();

    // smooth explode factor
    const k = 1 - Math.exp(-dt * 6);
    explodeRef.current.current = explodeRef.current.current + (explodeRef.current.target - explodeRef.current.current) * k;
    const factor = explodeRef.current.current;

    if (parts.length && (obj || root.current)) {
      const targetGroup = obj || root.current;
      const box = new THREE.Box3().setFromObject(targetGroup);
      const size = box.getSize(new THREE.Vector3());
      explodeLayoutRef.current.spacing = Math.max(size.length() * explodeDistance, 0.001);
      const base = explodeLayoutRef.current.spacing;

      for (const m of parts) {
        const basePos = m.userData.__basePosition;
        const dir = m.userData.__explodeDir;
        const idx = typeof m.userData.__explodeIndex === "number" ? m.userData.__explodeIndex : 1;
        if (basePos && dir) m.position.copy(basePos).addScaledVector(dir, base * factor * idx);
      }
    }

    if (autoRotate && root.current) root.current.rotation.y += dt * rotateSpeed;
    if (mixer && playAnims) mixer.update(dt);

    state.invalidate();
  });

  return (
    <>
      <hemisphereLight intensity={1.1} groundColor={"#1a2133"} />
      <directionalLight position={[5, 7, 4]} intensity={1.15} />

      <OrbitControls ref={orbit} makeDefault enableDamping dampingFactor={0.08} />

      <group ref={root} onPointerDown={onPointerDown} onPointerMissed={onMiss} />

      {selected && (
        <TransformControls ref={transform} object={selected} mode={transformMode} />
      )}
    </>
  );
}

export default function ViewerCanvas(props) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 50, position: [2.5, 2.0, 2.6], near: 0.01, far: 10000 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
    </Canvas>
  );
}
