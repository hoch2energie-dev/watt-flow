import { allocateCents, clamp, roundCents } from "@/lib/calc/money";

export type VatCategory = "PV_NULL" | "REGEL";

/**
 * Nullsteuersatz nach § 12 Abs. 3 UStG nur, wenn die Position als PV-Leistung
 * gekennzeichnet ist und das Angebot die Voraussetzungen als erfüllt markiert.
 * Sonst gilt der Regelsteuersatz 19 %.
 */
export function resolveVatRate(category: VatCategory, zeroRateEligible: boolean): number {
  if (category === "PV_NULL" && zeroRateEligible) return 0;
  return 0.19;
}

export type PriceLineInput = {
  id: string;
  section: string;
  name: string;
  quantity: number;
  unit: string;
  unitPriceNet: number;
  purchasePriceNet: number;
  discountPercent: number;
  vatCategory: VatCategory;
};

export type PricedLine = PriceLineInput & {
  vatRate: number;
  netBeforeRebate: number;
  rebateShare: number;
  net: number;
  vat: number;
  gross: number;
  purchase: number;
  margin: number;
};

export type VatBucket = { rate: number; net: number; vat: number; gross: number };

export type PriceSummary = {
  lines: PricedLine[];
  netBeforeRebate: number;
  rebateNet: number;
  net: number;
  vat: number;
  gross: number;
  purchase: number;
  margin: number;
  marginPercent: number;
  vatByRate: VatBucket[];
};

export function priceOffer(input: {
  lines: PriceLineInput[];
  rebateNet: number;
  zeroRateEligible: boolean;
}): PriceSummary {
  const prepared = input.lines.map((line) => {
    const quantity = Math.max(0, Number.isFinite(line.quantity) ? line.quantity : 0);
    const unitPriceNet = Math.max(0, Number.isFinite(line.unitPriceNet) ? line.unitPriceNet : 0);
    const purchasePriceNet = Math.max(0, Number.isFinite(line.purchasePriceNet) ? line.purchasePriceNet : 0);
    const discountPercent = clamp(line.discountPercent, 0, 100);
    const netBeforeRebate = roundCents(quantity * unitPriceNet * (1 - discountPercent / 100));
    const purchase = roundCents(quantity * purchasePriceNet);
    return { ...line, quantity, unitPriceNet, purchasePriceNet, discountPercent, netBeforeRebate, purchase };
  });

  const weights = prepared.map((line) => Math.round(line.netBeforeRebate * 100));
  const requestedRebate = Math.max(0, Number.isFinite(input.rebateNet) ? input.rebateNet : 0);
  const shares = allocateCents(weights, Math.round(requestedRebate * 100));

  const lines: PricedLine[] = prepared.map((line, index) => {
    const rebateShare = roundCents(shares[index] / 100);
    const net = roundCents(line.netBeforeRebate - rebateShare);
    const vatRate = resolveVatRate(line.vatCategory, input.zeroRateEligible);
    const vat = roundCents(net * vatRate);
    const gross = roundCents(net + vat);
    const margin = roundCents(net - line.purchase);
    return { ...line, vatRate, rebateShare, net, vat, gross, margin };
  });

  const netBeforeRebate = roundCents(lines.reduce((sum, line) => sum + line.netBeforeRebate, 0));
  const rebateNet = roundCents(lines.reduce((sum, line) => sum + line.rebateShare, 0));
  const net = roundCents(lines.reduce((sum, line) => sum + line.net, 0));
  const vat = roundCents(lines.reduce((sum, line) => sum + line.vat, 0));
  const gross = roundCents(net + vat);
  const purchase = roundCents(lines.reduce((sum, line) => sum + line.purchase, 0));
  const margin = roundCents(net - purchase);
  const marginPercent = net > 0 ? margin / net : 0;

  const buckets = new Map<number, VatBucket>();
  for (const line of lines) {
    const current = buckets.get(line.vatRate) ?? { rate: line.vatRate, net: 0, vat: 0, gross: 0 };
    current.net = roundCents(current.net + line.net);
    current.vat = roundCents(current.vat + line.vat);
    current.gross = roundCents(current.net + current.vat);
    buckets.set(line.vatRate, current);
  }

  return {
    lines,
    netBeforeRebate,
    rebateNet,
    net,
    vat,
    gross,
    purchase,
    margin,
    marginPercent,
    vatByRate: [...buckets.values()].sort((a, b) => a.rate - b.rate),
  };
}
