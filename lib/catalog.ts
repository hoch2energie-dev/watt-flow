export type SpecField = {
  key: string;
  label: string;
  unit?: string;
  kind: "number" | "text" | "select";
  /** Nachkommastellen eines Zahlenfelds im Katalog. Ohne Angabe keine. */
  digits?: number;
  options?: { value: string; label: string }[];
};

export type CatalogType = {
  key: string;
  label: string;
  group: string;
  defaultUnit: string;
  defaultVat: "PV_NULL" | "REGEL";
  fields: SpecField[];
};

const warranty: SpecField = { key: "warrantyYears", label: "Produktgarantie", unit: "Jahre", kind: "number" };

export const CATALOG_TYPES: CatalogType[] = [
  {
    key: "pv_module",
    label: "Photovoltaikmodul",
    group: "Photovoltaik",
    defaultUnit: "Stk",
    defaultVat: "PV_NULL",
    fields: [
      { key: "powerWp", label: "Leistung", unit: "Wp", kind: "number" },
      { key: "efficiencyPercent", label: "Wirkungsgrad", unit: "%", kind: "number" },
      { key: "widthMm", label: "Breite", unit: "mm", kind: "number" },
      { key: "heightMm", label: "Höhe", unit: "mm", kind: "number" },
      { key: "weightKg", label: "Gewicht", unit: "kg", kind: "number" },
      { key: "cellType", label: "Zelltyp", kind: "text" },
      /* Datenblattwerte bei Standardbedingungen, für die String-Prüfung in der 3D-Planung. */
      { key: "vocV", label: "Leerlaufspannung Voc", unit: "V", kind: "number", digits: 2 },
      { key: "iscA", label: "Kurzschlussstrom Isc", unit: "A", kind: "number", digits: 2 },
      { key: "vmppV", label: "Spannung im MPP (Vmpp)", unit: "V", kind: "number", digits: 2 },
      { key: "imppA", label: "Strom im MPP (Impp)", unit: "A", kind: "number", digits: 2 },
      { key: "tempCoeffVocPct", label: "Temperaturkoeffizient Voc", unit: "%/K", kind: "number", digits: 3 },
      warranty,
    ],
  },
  {
    key: "inverter",
    label: "Wechselrichter",
    group: "Photovoltaik",
    defaultUnit: "Stk",
    defaultVat: "PV_NULL",
    fields: [
      { key: "acPowerKw", label: "AC-Leistung", unit: "kW", kind: "number" },
      {
        key: "phases",
        label: "Phasen",
        kind: "select",
        options: [
          { value: "1", label: "einphasig" },
          { value: "3", label: "dreiphasig" },
        ],
      },
      { key: "mppt", label: "MPP-Tracker", kind: "number" },
      { key: "efficiencyPercent", label: "Max. Wirkungsgrad", unit: "%", kind: "number" },
      /* Grenzwerte aus dem Datenblatt, für die String-Prüfung in der 3D-Planung. */
      { key: "stringsPerMppt", label: "Strings je MPP-Tracker", kind: "number" },
      { key: "maxDcVoltageV", label: "Max. DC-Spannung", unit: "V", kind: "number" },
      { key: "mppMinV", label: "MPP-Bereich von", unit: "V", kind: "number" },
      { key: "mppMaxV", label: "MPP-Bereich bis", unit: "V", kind: "number" },
      { key: "maxInputCurrentA", label: "Max. Eingangsstrom je MPP-Tracker", unit: "A", kind: "number", digits: 1 },
      { key: "maxShortCircuitCurrentA", label: "Max. Kurzschlussstrom je MPP-Tracker", unit: "A", kind: "number", digits: 1 },
      { key: "maxDcPowerKw", label: "Max. DC-Leistung", unit: "kW", kind: "number", digits: 1 },
      warranty,
    ],
  },
  {
    key: "optimizer",
    label: "Leistungsoptimierer",
    group: "Photovoltaik",
    defaultUnit: "Stk",
    defaultVat: "PV_NULL",
    fields: [
      { key: "powerW", label: "Leistung", unit: "W", kind: "number" },
      warranty,
    ],
  },
  {
    key: "mounting_roof",
    label: "Aufdach-Montage",
    group: "Photovoltaik",
    defaultUnit: "Pauschale",
    defaultVat: "PV_NULL",
    fields: [
      { key: "roofType", label: "Dacheindeckung", kind: "text" },
      { key: "material", label: "Material", kind: "text" },
    ],
  },
  {
    key: "mounting_flat",
    label: "Flachdach-Montage",
    group: "Photovoltaik",
    defaultUnit: "Pauschale",
    defaultVat: "PV_NULL",
    fields: [
      { key: "material", label: "Material", kind: "text" },
      { key: "tiltDeg", label: "Aufständerung", unit: "°", kind: "number" },
    ],
  },
  {
    key: "battery",
    label: "Batteriespeicher",
    group: "Speicher",
    defaultUnit: "Stk",
    defaultVat: "PV_NULL",
    fields: [
      { key: "capacityKwh", label: "Nennkapazität", unit: "kWh", kind: "number" },
      { key: "usableKwh", label: "Nutzbare Kapazität", unit: "kWh", kind: "number" },
      { key: "powerKw", label: "Leistung", unit: "kW", kind: "number" },
      { key: "chemistry", label: "Zellchemie", kind: "text" },
      warranty,
    ],
  },
  {
    key: "backup",
    label: "Notstrom / Backup",
    group: "Speicher",
    defaultUnit: "Set",
    defaultVat: "PV_NULL",
    fields: [{ key: "powerKw", label: "Notstromleistung", unit: "kW", kind: "number" }],
  },
  {
    key: "energy_manager",
    label: "Energiemanagement",
    group: "Speicher",
    defaultUnit: "Stk",
    defaultVat: "REGEL",
    fields: [{ key: "protocol", label: "Schnittstelle", kind: "text" }],
  },
  {
    key: "monitoring",
    label: "Monitoring",
    group: "Elektro",
    defaultUnit: "Stk",
    defaultVat: "REGEL",
    fields: [{ key: "protocol", label: "Anbindung", kind: "text" }],
  },
  {
    key: "wallbox",
    label: "Wallbox",
    group: "Laden",
    defaultUnit: "Stk",
    defaultVat: "REGEL",
    fields: [
      { key: "powerKw", label: "Ladeleistung", unit: "kW", kind: "number" },
      {
        key: "phases",
        label: "Phasen",
        kind: "select",
        options: [
          { value: "1", label: "einphasig" },
          { value: "3", label: "dreiphasig" },
        ],
      },
      { key: "cableM", label: "Kabellänge", unit: "m", kind: "number" },
      { key: "authorization", label: "Freigabe", kind: "text" },
    ],
  },
  {
    key: "heat_pump",
    label: "Wärmepumpe",
    group: "Wärme",
    defaultUnit: "Stk",
    defaultVat: "REGEL",
    fields: [
      { key: "thermalPowerKw", label: "Heizleistung", unit: "kW", kind: "number" },
      { key: "scop", label: "SCOP", kind: "number" },
      {
        key: "source",
        label: "Quelle",
        kind: "select",
        options: [
          { value: "Luft", label: "Luft" },
          { value: "Sole", label: "Sole" },
          { value: "Wasser", label: "Wasser" },
        ],
      },
      { key: "refrigerant", label: "Kältemittel", kind: "text" },
    ],
  },
  {
    key: "hot_water_tank",
    label: "Warmwasserspeicher",
    group: "Wärme",
    defaultUnit: "Stk",
    defaultVat: "REGEL",
    fields: [{ key: "volumeL", label: "Volumen", unit: "l", kind: "number" }],
  },
  {
    key: "buffer_tank",
    label: "Pufferspeicher",
    group: "Wärme",
    defaultUnit: "Stk",
    defaultVat: "REGEL",
    fields: [{ key: "volumeL", label: "Volumen", unit: "l", kind: "number" }],
  },
  {
    key: "heating_rod",
    label: "Heizstab",
    group: "Wärme",
    defaultUnit: "Stk",
    defaultVat: "REGEL",
    fields: [{ key: "powerKw", label: "Leistung", unit: "kW", kind: "number" }],
  },
  {
    key: "cable_dc",
    label: "DC-Leitung",
    group: "Elektro",
    defaultUnit: "m",
    defaultVat: "PV_NULL",
    fields: [{ key: "crossSectionMm2", label: "Querschnitt", unit: "mm²", kind: "number" }],
  },
  {
    key: "cable_ac",
    label: "AC-Leitung",
    group: "Elektro",
    defaultUnit: "m",
    defaultVat: "PV_NULL",
    fields: [{ key: "crossSectionMm2", label: "Querschnitt", unit: "mm²", kind: "number" }],
  },
  {
    key: "surge_protection",
    label: "Überspannungsschutz",
    group: "Elektro",
    defaultUnit: "Stk",
    defaultVat: "PV_NULL",
    fields: [{ key: "spdType", label: "Typ", kind: "text" }],
  },
  {
    key: "meter",
    label: "Energiezähler",
    group: "Elektro",
    defaultUnit: "Stk",
    defaultVat: "REGEL",
    fields: [{ key: "mid", label: "MID", kind: "text" }],
  },
  {
    key: "labour_dc",
    label: "DC-Montage",
    group: "Leistung",
    defaultUnit: "Stunde",
    defaultVat: "PV_NULL",
    fields: [],
  },
  {
    key: "labour_ac",
    label: "AC-Montage",
    group: "Leistung",
    defaultUnit: "Stunde",
    defaultVat: "PV_NULL",
    fields: [],
  },
  {
    key: "scaffolding",
    label: "Gerüst / Arbeitsschutz",
    group: "Leistung",
    defaultUnit: "Pauschale",
    defaultVat: "REGEL",
    fields: [],
  },
  {
    key: "grid_connection",
    label: "Netzanschluss / HAK",
    group: "Leistung",
    defaultUnit: "Pauschale",
    defaultVat: "REGEL",
    fields: [],
  },
  {
    key: "commissioning",
    label: "Inbetriebnahme",
    group: "Leistung",
    defaultUnit: "Pauschale",
    defaultVat: "PV_NULL",
    fields: [],
  },
  {
    key: "planning",
    label: "Planung",
    group: "Leistung",
    defaultUnit: "Pauschale",
    defaultVat: "PV_NULL",
    fields: [],
  },
  {
    key: "extra",
    label: "Zusatzposition",
    group: "Sonstiges",
    defaultUnit: "Stk",
    defaultVat: "REGEL",
    fields: [],
  },
];

export const VAT_HELP =
  "PV_NULL ist die Vorlage für den Nullsteuersatz nach § 12 Abs. 3 UStG. Er greift nur, wenn das Angebot als begünstigt markiert ist. REGEL ist 19 %. Die Zuordnung ist eine Arbeitsvorlage und keine Steuerberatung.";

export const SECTION_TYPES: Record<string, string[]> = {
  module: ["pv_module"],
  inverter: ["inverter", "optimizer"],
  mounting: ["mounting_roof", "mounting_flat", "cable_dc", "cable_ac", "surge_protection", "labour_dc", "labour_ac", "commissioning", "planning"],
  storage: ["battery", "backup", "energy_manager"],
  wallbox: ["wallbox"],
  heatpump: ["heat_pump", "hot_water_tank", "buffer_tank", "heating_rod"],
  extra: CATALOG_TYPES.map((type) => type.key),
};

export function catalogType(key: string | null | undefined): CatalogType | undefined {
  return CATALOG_TYPES.find((type) => type.key === key);
}

export function catalogTypeLabel(key: string | null | undefined): string {
  return catalogType(key)?.label ?? "Sonstiges";
}
