"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Compass, Magnet, MousePointer2, PenLine, Redo2, Save, Scan, Trash2, Undo2, X } from "lucide-react";
import type { XY } from "@/lib/roof/geo";
import {
  BUILDING_LIMITS,
  ROOF_TYPE_LABELS,
  allowedRoofTypes,
  buildRoof,
  edgeLengths,
  newBuilding,
  normalizeBuilding,
  windName,
  type BuildingSpec,
  type RoofType,
} from "@/lib/roof3d/building";
import { formatMeters } from "@/lib/roof3d/draw";
import { Stage, type Tool, type ViewInfo } from "@/components/roof3d/stage";
import "./planner3d.css";

export type GroundSource =
  | { kind: "none" }
  | { kind: "image"; url: string; sizeM: number; credit: string }
  | { kind: "canvas"; paint: () => HTMLCanvasElement; sizeM: number; credit: string };

export type Planner3DProps = {
  title: string;
  subtitle?: string;
  initial: BuildingSpec[];
  ground: GroundSource;
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

export function Planner3D({ title, subtitle, initial, ground, locked = false, onSave, onGroundError, closeHref }: Planner3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] });
  const [live, setLive] = useState<BuildingSpec[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
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
  const selected = buildings.find((building) => building.id === selectedId) ?? null;
  const model = useMemo(() => (selected ? buildRoof(selected) : null), [selected]);
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

  const patchSelected = useCallback(
    (patch: Partial<BuildingSpec>, key: string) => {
      if (!selectedId || locked) return;
      commit(history.present.map((building) => (building.id === selectedId ? normalizeBuilding({ ...building, ...patch }) : building)), `${selectedId}:${key}`);
    },
    [commit, history.present, locked, selectedId],
  );
  const removeSelected = useCallback(() => {
    if (!selectedId || locked) return;
    commit(history.present.filter((building) => building.id !== selectedId));
    setSelectedId(null);
  }, [commit, history.present, locked, selectedId]);

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
    const stage = new Stage(canvasRef.current, overlayRef.current, {
      onSelect: (id) => setSelectedId(id),
      onCreate: (outline: XY[]) => {
        const building = newBuilding(newId(), outline);
        handlers.current.commit([...handlers.current.present, building]);
        setSelectedId(building.id);
        setTool("select");
      },
      onEdit: (id, outline, done) => {
        if (handlers.current.locked) return;
        const next = handlers.current.present.map((building) => (building.id === id ? { ...building, outline } : building));
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

  useEffect(() => stageRef.current?.setBuildings(buildings, selectedId), [buildings, selectedId]);
  useEffect(() => stageRef.current?.setTool(tool), [tool]);
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
      if (next === "draw" && locked) return;
      if (next === "draw") setFlat(true);
      setTool(next);
    },
    [locked],
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
        else if (tool === "draw") setTool("select");
        else setSelectedId(null);
      } else if (key === "backspace" && tool === "draw") {
        event.preventDefault();
        stageRef.current?.removeLastPoint();
      } else if ((key === "delete" || key === "backspace") && tool === "select") {
        removeSelected();
      } else if (key === "v") chooseTool("select");
      else if (key === "d") chooseTool("draw");
      else if (key === "2") setFlat(true);
      else if (key === "3") {
        setTool("select");
        setFlat(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseTool, draftPoints, redo, removeSelected, save, tool, undo]);

  const hint =
    tool === "draw"
      ? draftPoints === 0
        ? "Erste Hausecke auf dem Luftbild anklicken."
        : draftPoints < 3
          ? "Nächste Ecke anklicken. Rechte Winkel rasten ein, Umschalt löst das Raster."
          : "Weitere Ecke anklicken oder auf den ersten Punkt klicken, um das Dach zu schließen."
      : flat && selected && !locked
        ? "Punkt in der Kantenmitte ziehen, um die Seite zu verschieben. Im Dach ziehen, um das ganze Gebäude zu bewegen."
        : null;

  return (
    <div className="r3d">
      <canvas ref={canvasRef} className="r3d-canvas" aria-label="Zeichenfläche der 3D-Planung" />
      <svg ref={overlayRef} className="r3d-overlay" aria-hidden="true" />

      <header className="r3d-head">
        <div>
          <p className="r3d-title">{title}</p>
          {subtitle ? <p className="r3d-sub">{subtitle}</p> : null}
        </div>
        <ol className="r3d-steps" aria-label="Schritte der Planung">
          <li className="is-active"><span>1</span>Gebäude</li>
          <li title="Folgt in einer späteren Stufe"><span>2</span>Module</li>
          <li title="Folgt in einer späteren Stufe"><span>3</span>Strings</li>
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

      {selected && model ? (
        <aside className="r3d-panel" aria-label="Eigenschaften des Dachs">
          <h2>Dach</h2>
          <label className="r3d-field">
            <span>Dachform</span>
            <select id="r3d-type" value={selected.roofType} disabled={locked} onChange={(event) => patchSelected({ roofType: event.target.value as RoofType }, "type")}>
              {allowedRoofTypes(selected.outline).map((type) => (
                <option key={type} value={type}>{ROOF_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </label>
          {allowedRoofTypes(selected.outline).length === 1 ? (
            <p className="r3d-note">Bei Umrissen mit einspringenden Ecken geht nur das Flachdach. Für ein L-förmiges Haus zwei Gebäude zeichnen.</p>
          ) : null}
          {selected.roofType === "sattel" ? (
            <button type="button" className="r3d-button" disabled={locked} onClick={() => patchSelected({ ridgeSwap: !selected.ridgeSwap }, "swap")}>
              <ArrowLeftRight size={15} /> First drehen
            </button>
          ) : null}
          <NumberRow id="r3d-wall" label="Außenwandhöhe" unit="m" value={selected.wallHeightM} step={0.1} limits={BUILDING_LIMITS.wall} disabled={locked} onChange={(value) => patchSelected({ wallHeightM: value }, "wall")} />
          {selected.roofType !== "flach" ? (
            <NumberRow id="r3d-overhang" label="Dachüberstand" unit="cm" value={selected.overhangM * 100} step={5} limits={[0, 150]} disabled={locked} onChange={(value) => patchSelected({ overhangM: value / 100 }, "overhang")} />
          ) : null}

          {selected.roofType !== "flach" ? (
            <>
              <h3>Dachseiten</h3>
              <Sides building={selected} eaves={model.eaves} />
              {model.faces.map((face) => (
                <NumberRow
                  key={face.edge}
                  id={`r3d-pitch-${face.edge}`}
                  label={`Neigung ${windName(face.azimuthDeg)}`}
                  unit="°"
                  value={selected.pitchDeg[face.edge]}
                  step={1}
                  limits={BUILDING_LIMITS.pitch}
                  disabled={locked}
                  onChange={(value) => patchSelected({ pitchDeg: selected.pitchDeg.map((pitch, edge) => (edge === face.edge ? value : pitch)) }, `pitch${face.edge}`)}
                />
              ))}
            </>
          ) : null}

          <h3>Ergebnis</h3>
          <dl className="r3d-facts">
            <div><dt>Firsthöhe</dt><dd>{formatMeters(model.ridgeHeightM)}</dd></div>
            <div><dt>Dachfläche</dt><dd>{numberText(model.faces.reduce((sum, face) => sum + face.areaM2, 0))} m²</dd></div>
          </dl>
          <ul className="r3d-faces">
            {model.faces.map((face) => (
              <li key={face.edge}>
                <span>{selected.roofType === "flach" ? "Flachdach" : windName(face.azimuthDeg)}</span>
                <span>{selected.roofType === "flach" ? "0°" : `${numberText(face.azimuthDeg, 0)}° · ${numberText(face.tiltDeg, 0)}°`}</span>
                <span>{numberText(face.areaM2)} m²</span>
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
          <button type="button" className={flat ? "" : "is-on"} onClick={() => { setTool("select"); setFlat(false); }} title="Räumliche Ansicht (3)">3D</button>
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
          <button type="button" className={tool === "draw" ? "is-on" : ""} disabled={locked} onClick={() => chooseTool("draw")} title="Dach zeichnen (D)" aria-label="Dach zeichnen"><PenLine size={18} /><span>Dach zeichnen</span></button>
          <i />
          <button type="button" className={snap ? "is-on" : ""} onClick={() => setSnap(!snap)} title="Einrasten auf rechte Winkel. Umschalt kehrt es beim Zeichnen um." aria-label="Einrasten" aria-pressed={snap}><Magnet size={18} /></button>
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
        return (
          <g key={edge}>
            <line className={eave ? "is-eave" : ""} x1={corner[0]} y1={corner[1]} x2={next[0]} y2={next[1]} />
            <text x={mid[0] - out[0] * (15 + Math.abs(out[0]) * 16)} y={mid[1] - out[1] * (15 + Math.abs(out[0]) * 16) + 4} textAnchor="middle">
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
