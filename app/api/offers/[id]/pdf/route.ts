import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { calculateOffer } from "@/lib/calc/offer";
import { parsePdfPages } from "@/lib/content";
import { toOfferDTO } from "@/lib/dto";
import { toCalcInput } from "@/lib/domain";
import { addressLine, customerName } from "@/lib/format";
import { SEGMENT_LABEL } from "@/lib/labels";
import { renderOfferPdf } from "@/lib/pdf/offer-pdf";
import { prisma } from "@/lib/db";
import { ensureSettings } from "@/lib/settings";
import { safeStoredPath } from "@/lib/upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const { id } = await context.params;
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      variants: { include: { lines: true, faces: { orderBy: { sortOrder: "asc" as const } } }, orderBy: { sortOrder: "asc" } },
      request: { include: { customer: true } },
    },
  });
  if (!offer) return NextResponse.json({ error: "Angebot nicht gefunden." }, { status: 404 });
  const settings = await ensureSettings();
  const dto = toOfferDTO(offer);
  const variantId = new URL(request.url).searchParams.get("variant") || dto.variants.find((variant) => variant.recommended)?.id || dto.variants[0]?.id;
  let logoPath: string | null = null;
  if (settings.logoStoredName) {
    try {
      logoPath = safeStoredPath(settings.logoStoredName);
    } catch {
      logoPath = null;
    }
  }
  const customer = offer.request.customer;
  const pdf = await renderOfferPdf({
    company: {
      companyName: settings.companyName,
      street: settings.street,
      zip: settings.zip,
      city: settings.city,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      taxNumber: settings.taxNumber,
      vatId: settings.vatId,
      iban: settings.iban,
      bic: settings.bic,
      bankName: settings.bankName,
      logoPath,
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
      aboutText: settings.aboutText,
      legalText: settings.legalText,
      coverSubtitle: settings.coverSubtitle,
      pages: parsePdfPages(settings.pdfPages),
    },
    number: offer.number,
    title: offer.title,
    createdAt: offer.createdAt,
    customerName: customerName(customer),
    customerAddress: addressLine(customer),
    siteAddress: addressLine(offer.request),
    segmentLabel: SEGMENT_LABEL[offer.request.segment],
    offer: dto,
    activeVariantId: variantId ?? "",
    results: dto.variants.map((variant) => ({ variant, result: calculateOffer(toCalcInput(dto, variant)) })),
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${offer.number}.pdf"`,
    },
  });
}
