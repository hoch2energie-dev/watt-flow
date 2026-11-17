import * as THREE from "three";
import { pointInPolygon, polygonArea, signedArea, type XY } from "@/lib/roof/geo";
import { buildRoof, edgeLengths, type BuildingSpec, type Point3, type RoofModel } from "@/lib/roof3d/building";
import {
  CONTROL_DEFAULTS,
  DEG,
  FOV_DEG,
  VIEW_LIMITS,
  cameraPosition,
  groundPoint,
  orbit,
  panBy,
  pointerMode,
  projectPoint,
  wheelNotches,
  zoomBy,
  zoomFactor,
  type PointerMode,
  type View,
} from "@/lib/roof3d/camera";
import { formatMeters, moveOutline, pushEdge, snapDraft, type SnapResult } from "@/lib/roof3d/draw";
import { cellAt, faceFrame, heightOnFace, obstacleRing, type FaceFrame, type ObstacleKind } from "@/lib/roof3d/plans";

export type Tool = "select" | "draw" | ObstacleKind;
export type Step = "gebaeude" | "module";
/** Was gewählt ist: ein Gebäude, darin eine Dachfläche (nach Kante) oder ein Aufbau. */
export type Selection = { id: string | null; edge: number | null; obstacle: string | null };
export const NO_SELECTION: Selection = { id: null, edge: null, obstacle: null };

export type ViewInfo = { headingDeg: number; tiltDeg: number; distM: number };

export type StageEvents = {
  onSelect(selection: Selection): void;
  onCreate(outline: XY[]): void;
  /** `done` ist falsch, solange gezogen wird. */
  onEdit(id: string, outline: XY[], done: boolean): void;
  onPlaceObstacle(id: string, edge: number, kind: ObstacleKind, center: XY): void;
  onMoveObstacle(id: string, edge: number, obstacle: string, center: XY, done: boolean): void;
  /** Plätze des Modulrasters belegen oder leeren. Genannt sind alle Plätze des laufenden Strichs; eine leere Liste verwirft ihn. */
  onPaint(id: string, edge: number, indexes: number[], active: boolean, done: boolean): void;
  onDraft(points: number): void;
  onView(info: ViewInfo): void;
  onGroundError(): void;
};

type Press = {
  x: number;
  y: number;
  moved: number;
  drag:
    | { kind: "edge"; edge: number; base: XY[]; from: XY }
    | { kind: "move"; base: XY[]; from: XY }
    | { kind: "obstacle"; id: string; edge: number; obstacle: string; base: XY; from: XY; center: XY | null }
    | { kind: "paint"; id: string; edge: number; active: boolean; seen: number[] }
    | null;
  current: XY[] | null;
};

const START_VIEW: View = { target: [0, 0], heading: 0, tilt: 55 * DEG, dist: 60 };
const HANDLE_PX = 11;

/**
 * Zeichenfläche der 3D-Planung: three.js für Boden und Gebäude, ein SVG darüber für
 * Maße, Griffe und den Umriss beim Zeichnen. In der Draufsicht (2D) werden die Dächer
 * flach im SVG gezeichnet, damit sie deckungsgleich auf dem Luftbild liegen.
 */
export class Stage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.5, 4000);
  private ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;
  private group = new THREE.Group();
  private roofMaterial = new THREE.MeshLambertMaterial({ color: 0x2f3438, side: THREE.DoubleSide });
  private wallMaterial = new THREE.MeshLambertMaterial({ color: 0xf1ebe0, side: THREE.DoubleSide });
  private moduleMaterial = new THREE.MeshLambertMaterial({ color: 0x1b3f63, side: THREE.DoubleSide });
  private frameMaterial = new THREE.LineBasicMaterial({ color: 0xb4cde0 });
  private chimneyMaterial = new THREE.MeshLambertMaterial({ color: 0xb9b2a6, side: THREE.DoubleSide });
  private windowMaterial = new THREE.MeshLambertMaterial({ color: 0x7f97a6, side: THREE.DoubleSide });
  private zoneMaterial = new THREE.MeshLambertMaterial({ color: 0xd9a441, side: THREE.DoubleSide });

  private view: View = { ...START_VIEW };
  private flat = false;
  private restTilt = START_VIEW.tilt;
  private tiltGoal: number | null = null;
  private tool: Tool = "select";
  private snap = true;
  private buildings: BuildingSpec[] = [];
  private models = new Map<string, RoofModel>();
  private selection: Selection = NO_SELECTION;
  private step: Step = "gebaeude";
  private draft: XY[] = [];
  private hover: SnapResult | null = null;

  private mode: PointerMode = "idle";
  private chord = false;
  private last: { x: number; y: number } | null = null;
  private press: Press | null = null;
  private pendingZoom = 0;
  private zoomAnchor: XY | null = null;
  private dirty = true;
  private frameId = 0;
  private lastTime = 0;
  private lastInfo = "";
  private observer: ResizeObserver | null = null;
  private calm = false;

  constructor(private canvas: HTMLCanvasElement, private overlay: SVGSVGElement, private events: StageEvents) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
    sun.position.set(-30, 60, 40);
    this.scene.add(sun);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground, this.group);
    this.setGroundCanvas(placeholderGround(), 240);
    this.calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onPointer);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("dblclick", this.onDouble);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContext);
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
    this.resize();
    this.frameId = requestAnimationFrame(this.frame);
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.observer?.disconnect();
    const canvas = this.canvas;
    canvas.removeEventListener("pointerdown", this.onDown);
    canvas.removeEventListener("pointermove", this.onPointer);
    canvas.removeEventListener("pointerup", this.onUp);
    canvas.removeEventListener("pointercancel", this.onUp);
    canvas.removeEventListener("dblclick", this.onDouble);
    canvas.removeEventListener("wheel", this.onWheel);
    canvas.removeEventListener("contextmenu", this.onContext);
    this.clearGroup();
    this.ground.geometry.dispose();
    this.ground.material.map?.dispose();
    this.ground.material.dispose();
    this.renderer.dispose();
  }

  /* ---------- Zustand von außen ---------- */

  setBuildings(buildings: BuildingSpec[], selection: Selection) {
    this.buildings = buildings;
    this.selection = selection;
    this.models = new Map(buildings.map((building) => [building.id, buildRoof(building)]));
    this.clearGroup();
    for (const building of buildings) {
      const model = this.models.get(building.id);
      if (!model) continue;
      const add = (polygons: Point3[][], material: THREE.Material) => {
        if (polygons.length === 0) return;
        const mesh = new THREE.Mesh(meshOf(polygons), material);
        mesh.userData.id = building.id;
        this.group.add(mesh);
      };
      add(model.faces.map((face) => face.ring), this.roofMaterial);
      add(model.walls, this.wallMaterial);
      const panels: Point3[][] = [];
      const solids: Record<ObstacleKind, Point3[][]> = { sperrzone: [], kamin: [], fenster: [] };
      for (const face of model.faces) {
        const plan = building.plans?.[face.edge];
        if (!plan) continue;
        const frame = faceFrame(building, face);
        const lift = (point: XY, above: number): Point3 => [point[0], point[1], heightOnFace(frame, point) + above];
        for (const cell of plan.modules) if (cell.active) panels.push(cell.corners.map((corner) => lift(corner, 0.07)));
        for (const obstacle of plan.obstacles) {
          const ring = obstacleRing(frame, obstacle);
          if (obstacle.kind !== "kamin") {
            solids[obstacle.kind].push(ring.map((point) => lift(point, 0.04)));
            continue;
          }
          const top = Math.max(...ring.map((point) => heightOnFace(frame, point))) + Math.max(0.2, obstacle.heightM);
          solids.kamin.push(ring.map((point): Point3 => [point[0], point[1], top]));
          ring.forEach((point, index) => {
            const next = ring[(index + 1) % ring.length];
            solids.kamin.push([lift(point, -0.3), lift(next, -0.3), [next[0], next[1], top], [point[0], point[1], top]]);
          });
        }
      }
      add(panels, this.moduleMaterial);
      if (panels.length > 0) {
        /* Rahmenlinien, damit in der räumlichen Ansicht jedes Modul einzeln zu erkennen ist. */
        const frames = new THREE.LineSegments(framesOf(panels, 0.012), this.frameMaterial);
        frames.userData.id = building.id;
        this.group.add(frames);
      }
      add(solids.kamin, this.chimneyMaterial);
      add(solids.fenster, this.windowMaterial);
      add(solids.sperrzone, this.zoneMaterial);
    }
    this.dirty = true;
  }

  setStep(step: Step) {
    this.step = step;
    this.dirty = true;
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.draft = [];
    this.hover = null;
    this.events.onDraft(0);
    this.canvas.style.cursor = this.restCursor();
    this.dirty = true;
  }

  private restCursor(): string {
    return this.tool === "select" ? "default" : "crosshair";
  }

  setSnap(enabled: boolean) {
    this.snap = enabled;
  }

  /** Draufsicht (2D) an oder aus. Die Blickrichtung bleibt, nur die Neigung wechselt. */
  setFlat(flat: boolean) {
    if (flat === this.flat) return;
    if (flat) this.restTilt = this.view.tilt;
    this.flat = flat;
    this.tiltGoal = flat ? VIEW_LIMITS.tiltMin : Math.max(this.restTilt, 35 * DEG);
    if (this.calm) {
      this.view = { ...this.view, tilt: this.tiltGoal };
      this.tiltGoal = null;
    }
    this.dirty = true;
  }

  faceNorth() {
    this.view = { ...this.view, heading: 0 };
    this.dirty = true;
  }

  /** Rückt die Gebäude in die Bildmitte. */
  frameAll() {
    const points = this.buildings.flatMap((building) => building.outline);
    if (points.length === 0) {
      this.view = { ...START_VIEW, tilt: this.flat ? VIEW_LIMITS.tiltMin : START_VIEW.tilt };
    } else {
      const xs = points.map((point) => point[0]);
      const ys = points.map((point) => point[1]);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 10);
      this.view = { ...this.view, target: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], dist: Math.min(VIEW_LIMITS.distMax, span * 2.6) };
    }
    this.dirty = true;
  }

  removeLastPoint() {
    if (this.draft.length === 0) return;
    this.draft = this.draft.slice(0, -1);
    this.hover = null;
    this.events.onDraft(this.draft.length);
    this.dirty = true;
  }

  cancelDraft() {
    this.draft = [];
    this.hover = null;
    this.events.onDraft(0);
    this.dirty = true;
  }

  setGroundCanvas(source: HTMLCanvasElement, sizeM: number) {
    this.applyGround(new THREE.CanvasTexture(source), sizeM);
  }

  /** Luftbild als ein Bild, Norden oben, `sizeM` Meter Kantenlänge um den Ursprung. */
  setGroundImage(url: string, sizeM: number) {
    new THREE.TextureLoader().load(url, (texture) => this.applyGround(texture, sizeM), undefined, () => this.events.onGroundError());
  }

  private applyGround(texture: THREE.Texture, sizeM: number) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    this.ground.material.map?.dispose();
    this.ground.material.map = texture;
    this.ground.material.needsUpdate = true;
    this.ground.scale.set(sizeM, sizeM, 1);
    this.dirty = true;
  }

  private clearGroup() {
    for (const child of [...this.group.children]) {
      (child as THREE.Mesh).geometry.dispose();
      this.group.remove(child);
    }
  }

  /* ---------- Geometrie am Bildschirm ---------- */

  private size() {
    return { width: this.canvas.clientWidth || 1, height: this.canvas.clientHeight || 1 };
  }

  private groundAt(clientX: number, clientY: number): XY | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return groundPoint(this.view, ((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1), rect.width / rect.height);
  }

  private screen(point: XY, height = 0): { x: number; y: number; visible: boolean } {
    const { width, height: h } = this.size();
    const projected = projectPoint(this.view, point, height, width / h);
    return { x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * h, visible: projected.visible };
  }

  private metersPerPixel(): number {
    return (2 * this.view.dist * Math.tan((FOV_DEG * DEG) / 2)) / this.size().height;
  }

  private selected(): BuildingSpec | null {
    return this.buildings.find((building) => building.id === this.selection.id) ?? null;
  }

  private frameOf(building: BuildingSpec, edge: number): FaceFrame | null {
    const face = this.models.get(building.id)?.faces.find((entry) => entry.edge === edge);
    return face ? faceFrame(building, face) : null;
  }

  /** Dachfläche unter einem Punkt des Grundrisses. */
  private faceAt(point: XY): { building: BuildingSpec; edge: number } | null {
    for (let index = this.buildings.length - 1; index >= 0; index -= 1) {
      const building = this.buildings[index];
      for (const face of this.models.get(building.id)?.faces ?? []) {
        if (pointInPolygon(point, face.ring.map((corner): XY => [corner[0], corner[1]]))) return { building, edge: face.edge };
      }
    }
    return null;
  }

  private obstacleAt(point: XY): { building: BuildingSpec; edge: number; obstacle: string; center: XY } | null {
    for (let index = this.buildings.length - 1; index >= 0; index -= 1) {
      const building = this.buildings[index];
      for (const [key, plan] of Object.entries(building.plans ?? {})) {
        const frame = this.frameOf(building, Number(key));
        if (!frame) continue;
        for (const obstacle of plan.obstacles) {
          if (pointInPolygon(point, obstacleRing(frame, obstacle))) return { building, edge: Number(key), obstacle: obstacle.id, center: obstacle.center };
        }
      }
    }
    return null;
  }

  /* ---------- Maus ---------- */

  private onContext = (event: Event) => event.preventDefault();

  private onDown = (event: PointerEvent) => {
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* ohne Capture weiter */
    }
    this.press = event.buttons === 1 ? { x: event.clientX, y: event.clientY, moved: 0, drag: this.dragAt(event), current: null } : null;
    this.onPointer(event);
    event.preventDefault();
  };

  private dragAt(event: PointerEvent): Press["drag"] {
    const from = this.groundAt(event.clientX, event.clientY);
    if (!this.flat || !from) return null;
    if (this.step === "module") {
      /* Belegt wird nur auf der gewählten Fläche. Ein Klick auf eine andere Fläche wählt sie erst aus. */
      const face = this.faceAt(from);
      const chosen = face && face.building.id === this.selection.id && face.edge === this.selection.edge;
      const index = face && chosen ? cellAt(face.building.plans?.[face.edge], from) : -1;
      if (!face || index < 0) return null;
      const active = !face.building.plans![face.edge].modules[index].active;
      this.events.onPaint(face.building.id, face.edge, [index], active, false);
      return { kind: "paint", id: face.building.id, edge: face.edge, active, seen: [index] };
    }
    if (this.tool !== "select") return null;
    const hit = this.obstacleAt(from);
    if (hit) return { kind: "obstacle", id: hit.building.id, edge: hit.edge, obstacle: hit.obstacle, base: hit.center, from, center: null };
    const building = this.selected();
    if (!building) return null;
    const rect = this.canvas.getBoundingClientRect();
    const outline = building.outline;
    for (let edge = 0; edge < outline.length; edge += 1) {
      const next = outline[(edge + 1) % outline.length];
      const handle = this.screen([(outline[edge][0] + next[0]) / 2, (outline[edge][1] + next[1]) / 2]);
      if (Math.hypot(handle.x - (event.clientX - rect.left), handle.y - (event.clientY - rect.top)) <= HANDLE_PX) return { kind: "edge", edge, base: outline, from };
    }
    return pointInPolygon(from, outline) ? { kind: "move", base: outline, from } : null;
  }

  private onPointer = (event: PointerEvent) => {
    if ((event.buttons & 3) === 3) {
      /* Beide Tasten heißen Drehen. Ein Belegen, das mit der linken Taste schon begonnen hat, wird verworfen. */
      const drag = this.press?.drag;
      if (this.press && drag?.kind === "paint") {
        this.events.onPaint(drag.id, drag.edge, [], drag.active, true);
        this.press.drag = null;
      }
      this.chord = true;
    }
    const next = pointerMode(event.buttons, this.chord);
    if (next !== this.mode) {
      this.mode = next;
      this.last = { x: event.clientX, y: event.clientY };
      this.canvas.style.cursor = next === "rotate" ? "grabbing" : next === "pan" ? "move" : this.restCursor();
      return;
    }
    const last = this.last ?? { x: event.clientX, y: event.clientY };
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    if (this.press) this.press.moved += Math.abs(dx) + Math.abs(dy);
    if (this.mode === "rotate") {
      const step = CONTROL_DEFAULTS.rotateDegPerPx * DEG;
      this.view = orbit(this.view, dx * step, this.flat ? 0 : -dy * step);
      this.dirty = true;
    } else if (this.mode === "pan") {
      const from = this.groundAt(last.x, last.y);
      const to = this.groundAt(event.clientX, event.clientY);
      if (from && to) {
        this.view = panBy(this.view, from, to);
        this.dirty = true;
      }
    } else if (this.mode === "tool") {
      this.dragTo(event);
    } else if (this.tool === "draw") {
      this.hoverAt(event);
    }
    this.last = { x: event.clientX, y: event.clientY };
  };

  private dragTo(event: PointerEvent) {
    const press = this.press;
    const drag = press?.drag;
    if (!press || !drag) return;
    const to = this.groundAt(event.clientX, event.clientY);
    if (!to) return;
    if (drag.kind === "paint") {
      const building = this.buildings.find((entry) => entry.id === drag.id);
      const index = cellAt(building?.plans?.[drag.edge], to);
      if (index < 0 || drag.seen.includes(index)) return;
      drag.seen.push(index);
      this.events.onPaint(drag.id, drag.edge, drag.seen.slice(), drag.active, false);
      return;
    }
    if (press.moved < 4) return;
    if (drag.kind === "obstacle") {
      drag.center = [drag.base[0] + to[0] - drag.from[0], drag.base[1] + to[1] - drag.from[1]];
      this.events.onMoveObstacle(drag.id, drag.edge, drag.obstacle, drag.center, false);
      return;
    }
    const building = this.selected();
    if (!building) return;
    let outline: XY[];
    if (drag.kind === "edge") {
      const a = drag.base[drag.edge];
      const b = drag.base[(drag.edge + 1) % drag.base.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const distance = ((to[0] - drag.from[0]) * (b[1] - a[1]) - (to[1] - drag.from[1]) * (b[0] - a[0])) / length;
      outline = pushEdge(drag.base, drag.edge, distance);
      if (signedArea(outline) <= 0 || polygonArea(outline) < 4 || Math.min(...edgeLengths(outline)) < 1) return;
    } else {
      outline = moveOutline(drag.base, [to[0] - drag.from[0], to[1] - drag.from[1]]);
    }
    press.current = outline;
    this.events.onEdit(building.id, outline, false);
  }

  private hoverAt(event: PointerEvent) {
    const point = this.groundAt(event.clientX, event.clientY);
    this.hover = point ? snapDraft(this.draft, point, { enabled: this.snap !== event.shiftKey, radiusM: this.metersPerPixel() * 12 }) : null;
    this.dirty = true;
  }

  private onUp = (event: PointerEvent) => {
    const press = this.press;
    const clean = press != null && !this.chord && press.moved < 5;
    this.onPointer(event);
    if (event.buttons !== 0) return;
    const drag = press?.drag;
    if (drag?.kind === "paint") this.events.onPaint(drag.id, drag.edge, drag.seen, drag.active, true);
    else if (drag?.kind === "obstacle" && drag.center) this.events.onMoveObstacle(drag.id, drag.edge, drag.obstacle, drag.center, true);
    else if (press?.current && this.selection.id) this.events.onEdit(this.selection.id, press.current, true);
    else if (clean) this.click(event);
    this.chord = false;
    this.press = null;
    this.last = null;
    this.mode = "idle";
    this.canvas.style.cursor = this.restCursor();
  };

  private click(event: PointerEvent) {
    const point = this.groundAt(event.clientX, event.clientY);
    if (this.tool === "draw") {
      if (!point) return;
      const snapped = snapDraft(this.draft, point, { enabled: this.snap !== event.shiftKey, radiusM: this.metersPerPixel() * 12 });
      if (snapped.closes) return this.finishDraft();
      const last = this.draft[this.draft.length - 1];
      if (last && Math.hypot(last[0] - snapped.point[0], last[1] - snapped.point[1]) < 0.05) return;
      this.draft = [...this.draft, snapped.point];
      this.hover = null;
      this.events.onDraft(this.draft.length);
      this.dirty = true;
      return;
    }
    if (this.tool !== "select") {
      const face = point && this.flat ? this.faceAt(point) : null;
      if (face && point) this.events.onPlaceObstacle(face.building.id, face.edge, this.tool as ObstacleKind, point);
      return;
    }
    this.events.onSelect(this.pick(event, point));
  }

  private pick(event: PointerEvent, ground: XY | null): Selection {
    let point = ground;
    if (!this.flat) {
      /* Räumlich zählt die Stelle, an der der Blick das Gebäude trifft, nicht der Boden dahinter. */
      const rect = this.canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1)), this.camera);
      const hit = ray.intersectObjects(this.group.children.filter((child) => (child as THREE.Mesh).isMesh), false)[0];
      if (!hit) return this.step === "module" ? this.selection : NO_SELECTION;
      point = [hit.point.x, -hit.point.z];
      if (this.step === "gebaeude") return { id: hit.object.userData.id as string, edge: null, obstacle: null };
    }
    if (!point) return this.step === "module" ? this.selection : NO_SELECTION;
    if (this.step === "gebaeude") {
      const obstacle = this.obstacleAt(point);
      if (obstacle) return { id: obstacle.building.id, edge: obstacle.edge, obstacle: obstacle.obstacle };
      for (let index = this.buildings.length - 1; index >= 0; index -= 1) {
        if (pointInPolygon(point, this.buildings[index].outline)) return { id: this.buildings[index].id, edge: null, obstacle: null };
      }
    }
    const face = this.faceAt(point);
    if (!face) return this.step === "module" ? this.selection : NO_SELECTION;
    return { id: face.building.id, edge: this.step === "module" ? face.edge : null, obstacle: null };
  }

  private onDouble = () => {
    if (this.tool === "draw" && this.draft.length >= 3) this.finishDraft();
  };

  private finishDraft() {
    const outline = this.draft;
    this.draft = [];
    this.hover = null;
    this.events.onDraft(0);
    this.dirty = true;
    if (outline.length >= 3 && polygonArea(outline) >= 2) this.events.onCreate(outline);
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const notches = wheelNotches(event.deltaY, event.deltaMode, event.ctrlKey);
    if (!notches) return;
    this.zoomAnchor = this.groundAt(event.clientX, event.clientY);
    this.pendingZoom += Math.log(zoomFactor(notches));
    if (this.calm) {
      this.view = zoomBy(this.view, Math.exp(this.pendingZoom), this.zoomAnchor);
      this.pendingZoom = 0;
    }
    this.dirty = true;
  };

  /* ---------- Bild ---------- */

  private resize() {
    const { width, height } = this.size();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.dirty = true;
  }

  private frame = (now: number) => {
    const dt = this.lastTime ? Math.min(120, now - this.lastTime) : 16;
    this.lastTime = now;
    if (Math.abs(this.pendingZoom) > 1e-4) {
      const step = Math.abs(this.pendingZoom) < 0.004 ? this.pendingZoom : this.pendingZoom * (1 - Math.exp(-dt / CONTROL_DEFAULTS.zoomEaseMs));
      this.view = zoomBy(this.view, Math.exp(step), this.zoomAnchor);
      this.pendingZoom -= step;
      this.dirty = true;
    }
    if (this.tiltGoal != null) {
      const rest = this.tiltGoal - this.view.tilt;
      const done = Math.abs(rest) < 0.2 * DEG;
      this.view = { ...this.view, tilt: done ? this.tiltGoal : this.view.tilt + rest * (1 - Math.exp(-dt / 90)) };
      if (done) this.tiltGoal = null;
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.render();
    }
    this.frameId = requestAnimationFrame(this.frame);
  };

  private render() {
    const position = cameraPosition(this.view);
    this.camera.position.set(position[0], position[1], position[2]);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.view.target[0], 0, -this.view.target[1]);
    const topDown = this.flat && this.tiltGoal == null;
    this.group.visible = !topDown;
    this.renderer.render(this.scene, this.camera);
    this.overlay.innerHTML = this.overlayMarkup(topDown);
    const info: ViewInfo = {
      headingDeg: Math.round(this.view.heading / DEG) % 360,
      tiltDeg: Math.round(this.view.tilt / DEG),
      distM: Math.round(this.view.dist),
    };
    const key = `${info.headingDeg}|${info.tiltDeg}|${info.distM}`;
    if (key !== this.lastInfo) {
      this.lastInfo = key;
      this.events.onView(info);
    }
  }

  private overlayMarkup(topDown: boolean): string {
    const parts: string[] = [];
    const path = (points: XY[]) => points.map((point) => this.screen(point)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    if (topDown) {
      for (const building of this.buildings) {
        const model = this.models.get(building.id);
        if (!model) continue;
        const chosen = building.id === this.selection.id;
        const planning = this.step === "module";
        for (const face of model.faces) {
          const here = chosen && (!planning || this.selection.edge === face.edge);
          parts.push(`<polygon class="r3d-face${here ? " is-selected" : ""}" points="${path(face.ring.map((point): XY => [point[0], point[1]]))}"/>`);
        }
        parts.push(`<polygon class="r3d-outline${chosen && !planning ? " is-selected" : ""}" points="${path(building.outline)}"/>`);
        for (const face of model.faces) {
          const plan = building.plans?.[face.edge];
          if (!plan) continue;
          const frame = faceFrame(building, face);
          const open = planning && chosen && this.selection.edge === face.edge;
          for (const cell of plan.modules) {
            if (cell.active) parts.push(`<polygon class="r3d-module" points="${path(cell.corners)}"/>`);
            else if (open) {
              const a = this.screen(cell.corners[0]);
              const c = this.screen(cell.corners[2]);
              parts.push(`<polygon class="r3d-cell" points="${path(cell.corners)}"/><text class="r3d-plus" x="${((a.x + c.x) / 2).toFixed(1)}" y="${((a.y + c.y) / 2 + 5).toFixed(1)}" text-anchor="middle">+</text>`);
            }
          }
          for (const obstacle of plan.obstacles) {
            const picked = chosen && this.selection.obstacle === obstacle.id;
            parts.push(`<polygon class="r3d-obstacle is-${obstacle.kind}${picked ? " is-selected" : ""}" points="${path(obstacleRing(frame, obstacle))}"/>`);
          }
        }
      }
      const building = this.step === "gebaeude" && !this.selection.obstacle ? this.selected() : null;
      if (building) {
        const lengths = edgeLengths(building.outline);
        building.outline.forEach((corner, edge) => {
          const next = building.outline[(edge + 1) % building.outline.length];
          const mid = this.screen([(corner[0] + next[0]) / 2, (corner[1] + next[1]) / 2]);
          const a = this.screen(corner);
          const b = this.screen(next);
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          /* Am Bildschirm läuft der Umriss im Uhrzeigersinn, weil y nach unten zeigt. */
          const out = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
          const push = 18 + Math.abs(out.x) * 28;
          parts.push(label(mid.x + out.x * push, mid.y + out.y * push, formatMeters(lengths[edge])));
          if (this.tool === "select") parts.push(`<circle class="r3d-handle" cx="${mid.x.toFixed(1)}" cy="${mid.y.toFixed(1)}" r="6.5"/>`);
        });
      }
    }
    if (!topDown && this.tiltGoal == null) {
      /* Räumliche Ansicht: das gewählte Dach bekommt Umrisslinien, auch durch das Gebäude hindurch. */
      const model = this.selection.id ? this.models.get(this.selection.id) : null;
      const only = this.step === "module" ? this.selection.edge : null;
      for (const face of model?.faces ?? []) {
        if (only != null && face.edge !== only) continue;
        const corners = face.ring.map((point) => this.screen([point[0], point[1]], point[2]));
        if (corners.every((corner) => corner.visible)) parts.push(`<polygon class="r3d-edge3d" points="${corners.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}"/>`);
      }
    }
    if (this.tool === "draw" && this.draft.length > 0) {
      const tip = this.hover?.point ?? null;
      const last = this.draft[this.draft.length - 1];
      parts.push(`<polyline class="r3d-draft" points="${path(this.draft)}"/>`);
      if (tip) {
        const a = this.screen(last);
        const b = this.screen(tip);
        parts.push(`<line class="r3d-draft is-live" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`);
        if (this.hover?.aligned || this.hover?.closes) {
          const first = this.screen(this.draft[0]);
          parts.push(`<line class="r3d-guide" x1="${b.x.toFixed(1)}" y1="${b.y.toFixed(1)}" x2="${first.x.toFixed(1)}" y2="${first.y.toFixed(1)}"/>`);
        }
        if (this.hover?.rightAngle) {
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const before = this.screen(this.draft[this.draft.length - 2]);
          const back = Math.hypot(before.x - a.x, before.y - a.y) || 1;
          const u = { x: ((b.x - a.x) / length) * 11, y: ((b.y - a.y) / length) * 11 };
          const v = { x: ((before.x - a.x) / back) * 11, y: ((before.y - a.y) / back) * 11 };
          parts.push(`<polyline class="r3d-angle" points="${(a.x + u.x).toFixed(1)},${(a.y + u.y).toFixed(1)} ${(a.x + u.x + v.x).toFixed(1)},${(a.y + u.y + v.y).toFixed(1)} ${(a.x + v.x).toFixed(1)},${(a.y + v.y).toFixed(1)}"/>`);
        }
        const meters = Math.hypot(tip[0] - last[0], tip[1] - last[1]);
        if (meters > 0.05) parts.push(label((a.x + b.x) / 2, (a.y + b.y) / 2 - 16, formatMeters(meters)));
      }
      for (let index = 0; index + 1 < this.draft.length; index += 1) {
        const a = this.screen(this.draft[index]);
        const b = this.screen(this.draft[index + 1]);
        parts.push(label((a.x + b.x) / 2, (a.y + b.y) / 2 - 16, formatMeters(Math.hypot(this.draft[index + 1][0] - this.draft[index][0], this.draft[index + 1][1] - this.draft[index][1]))));
      }
      this.draft.forEach((point, index) => {
        const p = this.screen(point);
        const closing = index === 0 && this.draft.length >= 3;
        parts.push(`<circle class="r3d-point${closing ? " is-first" : ""}${closing && this.hover?.closes ? " is-hot" : ""}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${closing ? 8 : 4.5}"/>`);
      });
    }
    return parts.join("");
  }
}

function label(x: number, y: number, text: string): string {
  const width = text.length * 7 + 12;
  return `<g class="r3d-label" transform="translate(${(x - width / 2).toFixed(1)},${(y - 10).toFixed(1)})"><rect width="${width}" height="20" rx="4"/><text x="${width / 2}" y="14" text-anchor="middle">${text}</text></g>`;
}

/** Vielecke ohne einspringende Ecken als Dreiecke, in Weltkoordinaten (x Ost, y Höhe, z Süd). */
function meshOf(polygons: Point3[][]): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const ring of polygons) {
    for (let index = 1; index + 1 < ring.length; index += 1) {
      for (const point of [ring[0], ring[index], ring[index + 1]]) positions.push(point[0], point[2], -point[1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Umrisslinien der Vielecke, um `above` Meter angehoben, damit sie nicht in der Fläche flimmern. */
function framesOf(polygons: Point3[][], above: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const ring of polygons) {
    ring.forEach((point, index) => {
      const next = ring[(index + 1) % ring.length];
      positions.push(point[0], point[2] + above, -point[1], next[0], next[2] + above, -next[1]);
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

/** Neutraler Boden mit 10-m-Raster, solange kein Luftbild geladen ist. */
function placeholderGround(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 960;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.fillStyle = "#cfd8cf";
  context.fillRect(0, 0, 960, 960);
  context.strokeStyle = "rgba(60, 80, 70, 0.22)";
  context.lineWidth = 1;
  for (let line = 0; line <= 960; line += 40) {
    context.beginPath();
    context.moveTo(line, 0);
    context.lineTo(line, 960);
    context.moveTo(0, line);
    context.lineTo(960, line);
    context.stroke();
  }
  return canvas;
}
