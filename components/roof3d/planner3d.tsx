"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Compass, Flame, Magnet, MousePointer2, PenLine, Redo2, Save, Scan, SquareDashed, Trash2, Undo2, X } from "lucide-react";
import { angularDistance, type XY } from "@/lib/roof/geo";
import {
  BUILDING_LIMITS,
  ROOF_TYPE_LABELS,
  allowedRoofTypes,
  buildRoof,
  edgeLengths,
  newBuilding,
  windName,
  type BuildingSpec,
  type RoofFace3D,
  type RoofType,
} from "@/lib/roof3d/building";
import type { ModulePlacement } from "@/lib/roof/types";
import { formatMeters } from "@/lib/roof3d/draw";
import { OBSTACLE_DEFAULTS, PLACEMENT_DEFAULTS, moveObstacle, newObstacle, planTotals, setCells, syncPlans, updatePlan, withOutline, type FacePlan, type ObstacleKind, type ObstacleSpec } from "@/lib/roof3d/plans";
import { NO_SELECTION, Stage, type Selection, type Step, type Tool, type ViewInfo } from "@/components/roof3d/stage";
import "./planner3d.css";

export type GroundSource =
  | { kind: "none" }
  | { kind: "image"; url: string; sizeM: number; credit: string }
  | { kind: "canvas"; paint: () => HTMLCanvasElement; sizeM: number; credit: string };

/** Modul aus dem Katalog, mit den Maßen, die das Raster braucht. */
export type ModuleOption = { id: string; name: string; powerWp: number; widthM: number; heightM: number };

export type Planner3DProps = {
  title: string;
  subtitle?: string;
  initial: BuildingSpec[];
  ground: GroundSource;
  modules?: ModuleOption[];
  /** Modul, das vorgeschlagen wird, solange noch auf keiner Fläche eines gewählt ist. */
  defaultModuleId?: string | null;
  locked?: boolean;
  /** Speichert und gibt die Meldung für die Statuszeile zurück. Wirft bei Fehlern. */
  onSave?: (buildings: BuildingSpec[]) => Promise<string>;
  /** Das Luftbild ließ sich nicht laden. Der Aufrufer kann eine andere Quelle geben. */
  onGroundError?: () => void;
  closeHref?: string;
};

type History = { past: BuildingSpec[][]; present: BuildingSpec[]; future: BuildingSpec[][] };

const numberText = (value: number, digits = 1) => value.toFixed(digits).replace(".", ",");
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `b${Date.now()}${Math.round(Math.random() * 1e6)}`);
const OBSTACLE_TOOLS: { kind: ObstacleKind; icon: typeof Flame }[] = [
  { kind: "sperrzone", icon: SquareDashed },
  { kind: "kamin", icon: Flame },
  { kind: "fenster", icon: Scan },
];

/** Die Fläche, die am ehesten nach Süden schaut: dort beginnt man mit den Modulen. */
function sunniestEdge(building: BuildingSpec): number | null {
  const faces = buildRoof(building).faces;
  if (faces.length === 0) return null;
  return faces.reduce((best, face) => (angularDistance(face.azimuthDeg, 180) < angularDistance(best.azimuthDeg, 180) ? face : best)).edge;
}

const NO_MODULES: ModuleOption[] = [];

export function Planner3D({ title, subtitle, initial, ground, modules = NO_MODULES, defaultModuleId = null, locked = false, onSave, onGroundError, closeHref }: Planner3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] });
  const [live, setLive] = useState<BuildingSpec[] | null>(null);
  const [selection, setSelection] = useState<Selection>(initial[0] ? { id: initial[0].id, edge: null, obstacle: null } : NO_SELECTION);
  const [step, setStep] = useState<Step>("gebaeude");
  const [tool, setTool] = useState<Tool>(initial.length === 0 && !locked ? "draw" : "select");
  const [flat, setFlat] = useState(initial.length === 0);
  const [snap, setSnap] = useState(true);
  const [draftPoints, setDraftPoints] = useState(0);
  const [view, setView] = useState<ViewInfo>({ headingDeg: 0, tiltDeg: 55, distM: 60 });
  const [message, setMessage] = useState<string | null>(null);
  const [groundFailed, setGroundFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initial);
  const [closeArmed, setCloseArmed] = useState(false);
  const lastEdit = useRef({ key: "", time: 0 });

  const buildings = live ?? history.present;
  const selected = buildings.find((building) => building.id === selection.id) ?? null;
  const model = useMemo(() => (selected ? buildRoof(selected) : null), [selected]);
  const face = model && selection.edge != null ? model.faces.find((entry) => entry.edge === selection.edge) ?? null : null;
  const plan = selected && selection.edge != null ? selected.plans?.[selection.edge] : undefined;
  const obstacle = plan?.obstacles.find((entry) => entry.id === selection.obstacle) ?? null;
  const totals = useMemo(() => planTotals(buildings), [buildings]);
  /* Vorschlag für eine Fläche ohne Modul: so wie auf der zuletzt geplanten Fläche, sonst das Modul des Angebots. */
  const suggestion = useMemo<ModulePlacement | null>(() => {
    const ordered = selected ? [selected, ...buildings.filter((building) => building !== selected)] : buildings;
    for (const building of ordered) {
      for (const entry of Object.values(building.plans ?? {})) {
        if (entry.placement && modules.some((option) => option.id === entry.placement?.catalogItemId)) return entry.placement;
      }
    }
    const option = modules.find((entry) => entry.id === defaultModuleId) ?? modules[0];
    return option ? { ...PLACEMENT_DEFAULTS, catalogItemId: option.id, powerWp: option.powerWp, widthM: option.widthM, heightM: option.heightM } : null;
  }, [buildings, defaultModuleId, modules, selected]);
  const unsaved = history.present !== saved;

  /** Legt einen Schritt für Rückgängig an. Gleiche `key` kurz hintereinander zählt als ein Schritt. */
  const commit = useCallback((next: BuildingSpec[], key = "") => {
    const now = Date.now();
    const merge = key !== "" && key === lastEdit.current.key && now - lastEdit.current.time < 1500;
    lastEdit.current = { key, time: now };
    setHistory((current) => ({ past: merge ? current.past : [...current.past.slice(-49), current.present], present: next, future: [] }));
    setLive(null);
    setMessage(null);
    setCloseArmed(false);
  }, []);
  const undo = useCallback(() => {
    lastEdit.current = { key: "", time: 0 };
    setHistory((current) => (current.past.length === 0 ? current : { past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future] }));
  }, []);
  const redo = useCallback(() => {
    setHistory((current) => (current.future.length === 0 ? current : { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) }));
  }, []);

  /** Ändert das gewählte Gebäude. Raster, deren Fläche sich dabei ändert, werden neu berechnet. */
  const changeSelected = useCallback(
    (change: (building: BuildingSpec) => BuildingSpec, key: string) => {
      if (!selection.id || locked) return;
      /* Nur Zahlenfelder geben einen Schlüssel: Tippen in einem Feld zählt als ein Schritt. Auswahl und Knöpfe sind je ein eigener. */
      commit(history.present.map((building) => (building.id === selection.id ? syncPlans(change(building)) : building)), key ? `${selection.id}:${key}` : "");
    },
    [commit, history.present, locked, selection.id],
  );
  const changePlan = useCallback(
    (change: (plan: FacePlan) => FacePlan, key: string) => {
      const edge = selection.edge;
      if (edge == null) return;
      changeSelected((building) => updatePlan(building, edge, change), key ? `${edge}:${key}` : "");
    },
    [changeSelected, selection.edge],
  );
  const changeObstacle = useCallback(
    (patch: Partial<ObstacleSpec>, key: string) => {
      changePlan((current) => ({ ...current, obstacles: current.obstacles.map((entry) => (entry.id === selection.obstacle ? { ...entry, ...patch } : entry)) }), key ? `o:${selection.obstacle}:${key}` : "");
    },
    [changePlan, selection.obstacle],
  );
  const removeSelected = useCallback(() => {
    if (!selection.id || locked) return;
    if (selection.obstacle) {
      changePlan((current) => ({ ...current, obstacles: current.obstacles.filter((entry) => entry.id !== selection.obstacle) }), "");
      setSelection({ id: selection.id, edge: null, obstacle: null });
      return;
    }
    commit(history.present.filter((building) => building.id !== selection.id));
    setSelection(NO_SELECTION);
  }, [changePlan, commit, history.present, locked, selection]);

  const save = useCallback(async () => {
    if (!onSave || locked || saving) return;
    setSaving(true);
    const snapshot = history.present;
    try {
      setMessage(await onSave(snapshot));
      setSaved(snapshot);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Speichern ist fehlgeschlagen.");
    }
    setSaving(false);
  }, [history.present, locked, onSave, saving]);

  /* Die Bühne lebt außerhalb von React. Ihre Rückrufe lesen den jeweils aktuellen Stand über diese Ref. */
  const handlers = useRef({ present: history.present, commit, locked, onGroundError });
  handlers.current = { present: history.present, commit, locked, onGroundError };

  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current) return;
    const apply = (list: BuildingSpec[], id: string, change: (building: BuildingSpec) => BuildingSpec) => list.map((building) => (building.id === id ? change(building) : building));
    const stage = new Stage(canvasRef.current, overlayRef.current, {
      onSelect: setSelection,
      onCreate: (outline: XY[]) => {
        const building = newBuilding(newId(), outline);
        handlers.current.commit([...handlers.current.present, building]);
        setSelection({ id: building.id, edge: null, obstacle: null });
        setTool("select");
      },
      onEdit: (id, outline, done) => {
        if (handlers.current.locked) return;
        const next = apply(handlers.current.present, id, (building) => withOutline(building, outline));
        if (done) handlers.current.commit(next);
        else setLive(next);
      },
      onPlaceObstacle: (id, edge, kind, center, size) => {
        if (handlers.current.locked) return;
        const added = { ...newObstacle(newId(), kind, center), ...size };
        handlers.current.commit(apply(handlers.current.present, id, (building) => updatePlan(building, edge, (current) => ({ ...current, obstacles: [...current.obstacles, added] }))));
        setSelection({ id, edge, obstacle: added.id });
        setTool("select");
      },
      onMoveObstacle: (id, edge, moved, center, done) => {
        if (handlers.current.locked) return;
        /* Über den First gezogen wechselt der Aufbau die Dachseite. */
        let landed = edge;
        const next = apply(handlers.current.present, id, (building) => {
          const result = moveObstacle(building, edge, moved, center);
          landed = result.edge;
          return result.spec;
        });
        setSelection({ id, edge: landed, obstacle: moved });
        if (done) handlers.current.commit(next);
        else setLive(next);
      },
      onResizeObstacle: (id, edge, resized, shape, done) => {
        if (handlers.current.locked) return;
        const next = apply(handlers.current.present, id, (building) =>
          updatePlan(building, edge, (current) => ({ ...current, obstacles: current.obstacles.map((entry) => (entry.id === resized ? { ...entry, ...shape } : entry)) })),
        );
        if (done) handlers.current.commit(next);
        else setLive(next);
      },
      onPaint: (id, edge, indexes, active, done) => {
        if (handlers.current.locked) return;
        /* Die Bühne schickt immer alle Plätze des laufenden Strichs. Eine leere Liste heißt: verworfen. */
        if (indexes.length === 0) return setLive(null);
        const next = apply(handlers.current.present, id, (building) => setCells(building, edge, indexes, active));
        if (done) handlers.current.commit(next);
        else setLive(next);
      },
      onDraft: setDraftPoints,
      onView: setView,
      onGroundError: () => {
        setGroundFailed(true);
        handlers.current.onGroundError?.();
      },
    });
    stageRef.current = stage;
    stage.frameAll();
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  useEffect(() => stageRef.current?.setBuildings(buildings, selection), [buildings, selection]);
  useEffect(() => stageRef.current?.setTool(tool), [tool]);
  useEffect(() => stageRef.current?.setStep(step), [step]);
  useEffect(() => stageRef.current?.setSnap(snap), [snap]);
  useEffect(() => stageRef.current?.setFlat(flat), [flat]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setGroundFailed(false);
    if (ground.kind === "image") stage.setGroundImage(ground.url, ground.sizeM);
    else if (ground.kind === "canvas") stage.setGroundCanvas(ground.paint(), ground.sizeM);
  }, [ground]);

  const chooseTool = useCallback(
    (next: Tool) => {
      if (next !== "select" && locked) return;
      /* Der Umriss wird auf dem Luftbild gezeichnet, also in der Draufsicht. Alles andere geht in beiden Ansichten. */
      if (next === "draw") setFlat(true);
      setTool(next);
    },
    [locked],
  );
  const openStep = useCallback(
    (next: Step) => {
      setStep(next);
      setTool("select");
      if (next === "gebaeude") return setSelection((current) => ({ id: current.id, edge: null, obstacle: null }));
      const building = history.present.find((entry) => entry.id === selection.id) ?? history.present[0];
      setSelection(building ? { id: building.id, edge: sunniestEdge(building), obstacle: null } : NO_SELECTION);
    },
    [history.present, selection.id],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (command && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (command && key === "s") {
        event.preventDefault();
        void save();
      } else if (command) {
        return;
      } else if (key === "escape") {
        if (tool === "draw" && draftPoints > 0) stageRef.current?.cancelDraft();
        else if (tool !== "select") setTool("select");
        else setSelection(step === "module" ? { id: selection.id, edge: selection.edge, obstacle: null } : NO_SELECTION);
      } else if (key === "backspace" && tool === "draw") {
        event.preventDefault();
        stageRef.current?.removeLastPoint();
      } else if ((key === "delete" || key === "backspace") && tool === "select" && step === "gebaeude") {
        removeSelected();
      } else if (key === "v") chooseTool("select");
      else if (key === "d" && step === "gebaeude") chooseTool("draw");
      else if (key === "2") setFlat(true);
      else if (key === "3") {
        if (tool === "draw") setTool("select");
        setFlat(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseTool, draftPoints, redo, removeSelected, save, selection.edge, selection.id, step, tool, undo]);

  const hint =
    tool === "draw"
      ? draftPoints === 0
        ? "Erste Hausecke auf dem Luftbild anklicken."
        : draftPoints < 3
          ? "Nächste Ecke anklicken. Rechte Winkel rasten ein, Umschalt löst das Raster."
          : "Weitere Ecke anklicken oder auf den ersten Punkt klicken, um das Dach zu schließen."
      : tool !== "select"
        ? `${OBSTACLE_DEFAULTS[tool].label}: auf die Stelle im Dach klicken oder mit gedrückter Maustaste aufziehen.`
        : step === "module"
          ? buildings.length === 0
            ? "Zuerst im Schritt Gebäude ein Dach zeichnen."
            : !plan?.placement
              ? "Dachseite anklicken und rechts ein Modul wählen."
              : "Plätze anklicken oder mit gedrückter Maustaste überstreichen. Ein Klick auf ein Modul nimmt es wieder heraus."
          : locked || !selected
            ? null
            : obstacle
              ? "Aufbau ziehen, um ihn zu verschieben. An den Griffen ziehen, um ihn breiter oder länger zu machen."
              : flat
                ? "Punkt in der Kantenmitte ziehen, um die Seite zu verschieben. Im Dach ziehen, um das ganze Gebäude zu bewegen."
                : "Umriss und Lage des Gebäudes lassen sich in der Draufsicht (2D) ändern. Aufbauten und Module gehen in beiden Ansichten.";

  return (
    <div className="r3d">
      <canvas ref={canvasRef} className="r3d-canvas" aria-label="Zeichenfläche der 3D-Planung" />
      <svg ref={overlayRef} className="r3d-overlay" aria-hidden="true" />

      <header className="r3d-head">
        <div>
          <p className="r3d-title">{title}</p>
          {subtitle ? <p className="r3d-sub">{subtitle}</p> : null}
          {totals.modules > 0 ? <p className="r3d-total">{totals.modules} Module · {numberText(totals.kwp, 2)} kWp</p> : null}
        </div>
        <ol className="r3d-steps" aria-label="Schritte der Planung">
          <li><button type="button" className={step === "gebaeude" ? "is-active" : ""} onClick={() => openStep("gebaeude")}><span>1</span>Gebäude</button></li>
          <li><button type="button" className={step === "module" ? "is-active" : ""} onClick={() => openStep("module")}><span>2</span>Module</button></li>
          <li><button type="button" disabled title="Folgt in einer späteren Stufe"><span>3</span>Strings</button></li>
        </ol>
        {closeHref ? (
          <a
            className="r3d-icon"
            href={closeHref}
            aria-label="Planung schließen"
            title="Schließen"
            onClick={(event) => {
              if (!unsaved || closeArmed || locked) return;
              event.preventDefault();
              setCloseArmed(true);
              setMessage("Es gibt ungespeicherte Änderungen. Zuerst speichern, oder zum Verwerfen noch einmal auf Schließen klicken.");
            }}
          >
            <X size={18} />
          </a>
        ) : null}
      </header>

      {step === "module" && selected && face ? (
        <ModulePanel face={face} plan={plan} options={modules} suggestion={suggestion} locked={locked} flatRoof={selected.roofType === "flach"} onPlan={changePlan} onCells={(active) => changeSelected((building) => setCells(building, face.edge, "all", active), "")} />
      ) : step === "gebaeude" && selected && obstacle && face ? (
        <ObstaclePanel obstacle={obstacle} locked={locked} onChange={changeObstacle} onRemove={removeSelected} />
      ) : step === "gebaeude" && selected && model ? (
        <aside className="r3d-panel" aria-label="Eigenschaften des Dachs">
          <h2>Dach</h2>
          <label className="r3d-field">
            <span>Dachform</span>
            <select id="r3d-type" value={selected.roofType} disabled={locked} onChange={(event) => changeSelected((building) => ({ ...building, roofType: event.target.value as RoofType }), "")}>
              {allowedRoofTypes(selected.outline).map((type) => (
                <option key={type} value={type}>{ROOF_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </label>
          {allowedRoofTypes(selected.outline).length === 1 ? (
            <p className="r3d-note">Bei Umrissen mit einspringenden Ecken geht nur das Flachdach. Für ein L-förmiges Haus zwei Gebäude zeichnen.</p>
          ) : null}
          {selected.roofType === "sattel" ? (
            <button type="button" className="r3d-button" disabled={locked} onClick={() => changeSelected((building) => ({ ...building, ridgeSwap: !building.ridgeSwap }), "")}>
              <ArrowLeftRight size={15} /> First drehen
            </button>
          ) : null}
          <NumberRow id="r3d-wall" label="Außenwandhöhe" unit="m" value={selected.wallHeightM} step={0.1} limits={BUILDING_LIMITS.wall} disabled={locked} onChange={(value) => changeSelected((building) => ({ ...building, wallHeightM: value }), "wall")} />
          {selected.roofType !== "flach" ? (
            <NumberRow id="r3d-overhang" label="Dachüberstand" unit="cm" value={selected.overhangM * 100} step={5} limits={[0, 150]} disabled={locked} onChange={(value) => changeSelected((building) => ({ ...building, overhangM: value / 100 }), "overhang")} />
          ) : null}

          {selected.roofType !== "flach" ? (
            <>
              <h3>Dachseiten</h3>
              <Sides building={selected} eaves={model.eaves} />
              {model.faces.map((entry) => (
                <NumberRow
                  key={entry.edge}
                  id={`r3d-pitch-${entry.edge}`}
                  label={`Neigung ${windName(entry.azimuthDeg)}`}
                  unit="°"
                  value={selected.pitchDeg[entry.edge]}
                  step={1}
                  limits={BUILDING_LIMITS.pitch}
                  disabled={locked}
                  onChange={(value) => changeSelected((building) => ({ ...building, pitchDeg: building.pitchDeg.map((pitch, edge) => (edge === entry.edge ? value : pitch)) }), `pitch${entry.edge}`)}
                />
              ))}
            </>
          ) : null}

          <h3>Ergebnis</h3>
          <dl className="r3d-facts">
            <div><dt>Firsthöhe</dt><dd>{formatMeters(model.ridgeHeightM)}</dd></div>
            <div><dt>Dachfläche</dt><dd>{numberText(model.faces.reduce((sum, entry) => sum + entry.areaM2, 0))} m²</dd></div>
          </dl>
          <ul className="r3d-faces">
            {model.faces.map((entry) => (
              <li key={entry.edge}>
                <span>{selected.roofType === "flach" ? "Flachdach" : windName(entry.azimuthDeg)}</span>
                <span>{selected.roofType === "flach" ? "0°" : `${numberText(entry.azimuthDeg, 0)}° · ${numberText(entry.tiltDeg, 0)}°`}</span>
                <span>{numberText(entry.areaM2)} m²</span>
              </li>
            ))}
          </ul>
          <button type="button" className="r3d-button is-danger" disabled={locked} onClick={removeSelected}>
            <Trash2 size={15} /> Dach löschen
          </button>
        </aside>
      ) : null}

      <div className="r3d-corner">
        <button type="button" className="r3d-icon" onClick={() => stageRef.current?.faceNorth()} title="Nach Norden ausrichten" aria-label="Nach Norden ausrichten">
          <Compass size={18} style={{ transform: `rotate(${-view.headingDeg - 45}deg)` }} />
        </button>
        <div className="r3d-toggle" role="group" aria-label="Ansicht">
          <button type="button" className={flat ? "is-on" : ""} onClick={() => setFlat(true)} title="Draufsicht (2)">2D</button>
          <button type="button" className={flat ? "" : "is-on"} onClick={() => { if (tool === "draw") setTool("select"); setFlat(false); }} title="Räumliche Ansicht (3)">3D</button>
        </div>
        <button type="button" className="r3d-icon" onClick={() => stageRef.current?.frameAll()} title="Alle Gebäude ins Bild" aria-label="Alle Gebäude ins Bild">
          <Scan size={18} />
        </button>
        <span className="r3d-credit">
          {ground.kind === "none" || groundFailed ? "Kein Luftbild geladen" : ground.credit}
        </span>
      </div>

      <div className="r3d-dock">
        {message ?? hint ? <p className="r3d-hint" role="status">{message ?? hint}</p> : null}
        <div className="r3d-tools" role="toolbar" aria-label="Werkzeuge">
          <button type="button" className={tool === "select" ? "is-on" : ""} onClick={() => chooseTool("select")} title="Auswählen (V)" aria-label="Auswählen"><MousePointer2 size={18} /></button>
          {step === "gebaeude" ? (
            <>
              <button type="button" className={tool === "draw" ? "is-on" : ""} disabled={locked} onClick={() => chooseTool("draw")} title="Dach zeichnen (D)" aria-label="Dach zeichnen"><PenLine size={18} /><span>Dach zeichnen</span></button>
              {OBSTACLE_TOOLS.map(({ kind, icon: Icon }) => (
                <button key={kind} type="button" className={tool === kind ? "is-on" : ""} disabled={locked || buildings.length === 0} onClick={() => chooseTool(kind)} title={`${OBSTACLE_DEFAULTS[kind].label} setzen`} aria-label={`${OBSTACLE_DEFAULTS[kind].label} setzen`}>
                  <Icon size={18} /><span>{OBSTACLE_DEFAULTS[kind].label}</span>
                </button>
              ))}
              <i />
              <button type="button" className={snap ? "is-on" : ""} onClick={() => setSnap(!snap)} title="Einrasten auf rechte Winkel. Umschalt kehrt es beim Zeichnen um." aria-label="Einrasten" aria-pressed={snap}><Magnet size={18} /></button>
            </>
          ) : null}
          <i />
          <button type="button" disabled={history.past.length === 0 || locked} onClick={undo} title="Rückgängig (⌘Z)" aria-label="Rückgängig"><Undo2 size={18} /></button>
          <button type="button" disabled={history.future.length === 0 || locked} onClick={redo} title="Wiederholen (⇧⌘Z)" aria-label="Wiederholen"><Redo2 size={18} /></button>
          <i />
          <button type="button" className="is-primary" disabled={!onSave || locked || saving} onClick={() => void save()} title="Speichern (⌘S)">
            <Save size={18} /><span>{saving ? "Speichert…" : unsaved ? "Speichern" : "Gespeichert"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ModulePanel({ face, plan, options, suggestion, locked, flatRoof, onPlan, onCells }: { face: RoofFace3D; plan: FacePlan | undefined; options: ModuleOption[]; suggestion: ModulePlacement | null; locked: boolean; flatRoof: boolean; onPlan: (change: (plan: FacePlan) => FacePlan, key: string) => void; onCells: (active: boolean) => void }) {
  const placement = plan?.placement ?? null;
  const count = plan?.modules.filter((cell) => cell.active).length ?? 0;
  const places = plan?.modules.length ?? 0;
  const known = placement ? options.some((option) => option.id === placement.catalogItemId) : true;
  const choose = (id: string) => {
    const option = options.find((entry) => entry.id === id);
    onPlan(
      (current) => ({
        ...current,
        placement: option ? { ...PLACEMENT_DEFAULTS, ...current.placement, catalogItemId: option.id, powerWp: option.powerWp, widthM: option.widthM, heightM: option.heightM } : null,
      }),
      "",
    );
  };
  return (
    <aside className="r3d-panel" aria-label="Module auf der Dachfläche">
      <h2>{flatRoof ? "Flachdach" : `Dachseite ${windName(face.azimuthDeg)}`}</h2>
      <p className="r3d-note">{flatRoof ? "Flach, Module liegen ohne Aufständerung." : `Neigung ${numberText(face.tiltDeg, 0)}°, Ausrichtung ${numberText(face.azimuthDeg, 0)}°`} · {numberText(face.areaM2)} m²</p>
      <label className="r3d-field is-stacked">
        <span>Modul</span>
        <select id="r3d-module" value={placement?.catalogItemId ?? ""} disabled={locked} onChange={(event) => choose(event.target.value)}>
          <option value="">Kein Modul</option>
          {!known && placement ? <option value={placement.catalogItemId ?? ""}>{numberText(placement.powerWp, 0)} Wp (nicht mehr im Katalog)</option> : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </label>
      {options.length === 0 ? <p className="r3d-note">Im Katalog fehlt ein Modul mit Leistung, Breite und Höhe.</p> : null}
      {!placement && suggestion ? (
        <>
          <button type="button" id="r3d-grid" className="r3d-button is-primary" disabled={locked} onClick={() => onPlan((current) => ({ ...current, placement: suggestion }), "")}>
            Raster anlegen
          </button>
          <p className="r3d-note is-below">
            Mit {options.find((option) => option.id === suggestion.catalogItemId)?.name ?? "dem gewählten Modul"}, {suggestion.portrait ? "hochkant" : "quer"}. Danach zählt für diese Fläche die Belegung als Leistung.
          </p>
        </>
      ) : null}
      {placement ? (
        <>
          <label className="r3d-field">
            <span>Ausrichtung</span>
            <select id="r3d-portrait" value={placement.portrait ? "hoch" : "quer"} disabled={locked} onChange={(event) => onPlan((current) => ({ ...current, placement: current.placement ? { ...current.placement, portrait: event.target.value === "hoch" } : null }), "")}>
              <option value="hoch">Hochkant</option>
              <option value="quer">Quer</option>
            </select>
          </label>
          <NumberRow id="r3d-setback" label="Randabstand" unit="cm" value={placement.setbackM * 100} step={5} limits={[0, 300]} disabled={locked} onChange={(value) => onPlan((current) => ({ ...current, placement: current.placement ? { ...current.placement, setbackM: value / 100 } : null }), "setback")} />
          <NumberRow id="r3d-gap" label="Modulabstand" unit="cm" value={placement.gapM * 100} step={1} limits={[0, 100]} disabled={locked} onChange={(value) => onPlan((current) => ({ ...current, placement: current.placement ? { ...current.placement, gapM: value / 100 } : null }), "gap")} />
          <h3>Belegung</h3>
          <dl className="r3d-facts">
            <div><dt>Module</dt><dd id="r3d-count">{count} von {places}</dd></div>
            <div><dt>Leistung</dt><dd>{numberText((count * placement.powerWp) / 1000, 2)} kWp</dd></div>
          </dl>
          <div className="r3d-row">
            <button type="button" className="r3d-button" disabled={locked || places === 0 || count === places} onClick={() => onCells(true)}>Alle belegen</button>
            <button type="button" className="r3d-button" disabled={locked || count === 0} onClick={() => onCells(false)}>Leeren</button>
          </div>
          {places === 0 ? <p className="r3d-note">Auf diese Fläche passt so kein Modul. Randabstand verkleinern oder quer legen.</p> : null}
        </>
      ) : null}
    </aside>
  );
}

function ObstaclePanel({ obstacle, locked, onChange, onRemove }: { obstacle: ObstacleSpec; locked: boolean; onChange: (patch: Partial<ObstacleSpec>, key: string) => void; onRemove: () => void }) {
  const free = Boolean(obstacle.shape);
  return (
    <aside className="r3d-panel" aria-label="Eigenschaften des Aufbaus">
      <h2>{OBSTACLE_DEFAULTS[obstacle.kind].label}</h2>
      <div className="r3d-kinds" role="group" aria-label="Art des Aufbaus">
        {(Object.keys(OBSTACLE_DEFAULTS) as ObstacleKind[]).map((kind) => (
          <button key={kind} type="button" className={obstacle.kind === kind ? "is-on" : ""} disabled={locked} onClick={() => onChange({ kind, heightM: kind === "kamin" ? Math.max(obstacle.heightM, 1) : 0 }, "")}>
            {OBSTACLE_DEFAULTS[kind].label}
          </button>
        ))}
      </div>
      {free ? (
        <p className="r3d-note">Freie Form aus der alten Dachplanung. Sie lässt sich verschieben und löschen, die Maße bleiben.</p>
      ) : (
        <>
          <NumberRow id="r3d-ob-width" label="Breite" unit="cm" value={obstacle.widthM * 100} step={5} limits={[10, 2000]} disabled={locked} onChange={(value) => onChange({ widthM: value / 100 }, "w")} />
          <NumberRow id="r3d-ob-length" label="Länge auf dem Dach" unit="cm" value={obstacle.lengthM * 100} step={5} limits={[10, 2000]} disabled={locked} onChange={(value) => onChange({ lengthM: value / 100 }, "l")} />
        </>
      )}
      {obstacle.kind === "kamin" ? <NumberRow id="r3d-ob-height" label="Höhe" unit="m" value={obstacle.heightM} step={0.1} limits={[0.1, 10]} disabled={locked} onChange={(value) => onChange({ heightM: value }, "h")} /> : null}
      {free ? null : <NumberRow id="r3d-ob-margin" label="Abstand der Module" unit="cm" value={obstacle.marginM * 100} step={5} limits={[0, 200]} disabled={locked} onChange={(value) => onChange({ marginM: value / 100 }, "m")} />}
      <p className="r3d-note">{free ? "Ziehen verschiebt den Aufbau." : "Ziehen verschiebt den Aufbau. An den Griffen ändert sich die Größe, mit Umschalt ohne 5-cm-Raster."}</p>
      <button type="button" className="r3d-button is-danger" disabled={locked} onClick={onRemove}>
        <Trash2 size={15} /> {OBSTACLE_DEFAULTS[obstacle.kind].label} löschen
      </button>
    </aside>
  );
}

function NumberRow({ id, label, unit, value, step, limits, disabled, onChange }: { id: string; label: string; unit: string; value: number; step: number; limits: readonly [number, number]; disabled: boolean; onChange: (value: number) => void }) {
  const shown = Math.round(value * 100) / 100;
  const [text, setText] = useState(String(shown));
  const [known, setKnown] = useState(shown);
  if (known !== shown) {
    setKnown(shown);
    setText(String(shown));
  }
  return (
    <label className="r3d-field" htmlFor={id}>
      <span>{label}</span>
      <span className="r3d-number">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={text}
          step={step}
          min={limits[0]}
          max={limits[1]}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            const next = Number(event.target.value);
            if (event.target.value !== "" && Number.isFinite(next) && next >= limits[0] && next <= limits[1]) onChange(next);
          }}
          onBlur={() => setText(String(shown))}
        />
        <em>{unit}</em>
      </span>
    </label>
  );
}

/** Kleiner Grundriss, Norden oben, mit der Neigung an jeder Traufe. */
function Sides({ building, eaves }: { building: BuildingSpec; eaves: number[] }) {
  const xs = building.outline.map((point) => point[0]);
  const ys = building.outline.map((point) => point[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const scale = 96 / span;
  const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const at = (point: XY): XY => [120 + (point[0] - center[0]) * scale, 80 - (point[1] - center[1]) * scale];
  const corners = building.outline.map(at);
  const lengths = edgeLengths(building.outline);
  return (
    <svg className="r3d-sides" viewBox="0 0 240 160" role="img" aria-label="Grundriss mit Neigung je Dachseite">
      <polygon points={corners.map((corner) => corner.join(",")).join(" ")} />
      {corners.map((corner, edge) => {
        const next = corners[(edge + 1) % corners.length];
        const mid = [(corner[0] + next[0]) / 2, (corner[1] + next[1]) / 2];
        const length = Math.hypot(next[0] - corner[0], next[1] - corner[1]) || 1;
        const out = [(next[1] - corner[1]) / length, -(next[0] - corner[0]) / length];
        const eave = eaves.includes(edge);
        const push = 15 + Math.abs(out[0]) * 16;
        return (
          <g key={edge}>
            <line className={eave ? "is-eave" : ""} x1={corner[0]} y1={corner[1]} x2={next[0]} y2={next[1]} />
            <text x={mid[0] - out[0] * push} y={mid[1] - out[1] * push + 4} textAnchor="middle">
              {eave ? `${numberText(building.pitchDeg[edge], 0)}°` : "Giebel"}
            </text>
            <text className="is-length" x={mid[0] + out[0] * 13} y={mid[1] + out[1] * 13 + 4} textAnchor="middle">{numberText(lengths[edge])}</text>
          </g>
        );
      })}
      <text className="is-north" x="226" y="16" textAnchor="middle">N</text>
    </svg>
  );
}
