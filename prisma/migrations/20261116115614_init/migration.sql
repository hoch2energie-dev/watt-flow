-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('HAUSHALT', 'GEWERBE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEU', 'IN_QUALIFIZIERUNG', 'QUALIFIZIERT', 'ANGEBOT_ERSTELLT', 'GEWONNEN', 'VERLOREN', 'UNGEEIGNET');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ENTWURF', 'VERSENDET', 'ANGENOMMEN', 'ABGELEHNT');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('BAR', 'FINANZIERUNG', 'RATEN');

-- CreateEnum
CREATE TYPE "VatCategory" AS ENUM ('PV_NULL', 'REGEL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "segment" "Segment" NOT NULL DEFAULT 'HAUSHALT',
    "companyName" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "street" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEU',
    "assigneeId" TEXT,
    "street" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "qualification" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "customerId" TEXT,
    "requestId" TEXT,
    "offerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'datei',
    "customerId" TEXT,
    "requestId" TEXT,
    "offerId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "typeKey" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'Stk',
    "purchasePriceNet" DECIMAL(12,2) NOT NULL,
    "salesPriceNet" DECIMAL(12,2) NOT NULL,
    "vatCategory" "VatCategory" NOT NULL DEFAULT 'REGEL',
    "specs" JSONB NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanStage" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#1e5c42',
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KanbanStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "number" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'ENTWURF',
    "stageId" TEXT,
    "authorId" TEXT,
    "householdKwh" DECIMAL(12,1) NOT NULL DEFAULT 0,
    "heatPumpElectricKwh" DECIMAL(12,1) NOT NULL DEFAULT 0,
    "heatPumpThermalKwh" DECIMAL(12,1) NOT NULL DEFAULT 0,
    "evKwh" DECIMAL(12,1) NOT NULL DEFAULT 0,
    "otherKwh" DECIMAL(12,1) NOT NULL DEFAULT 0,
    "electricityPriceEur" DECIMAL(8,4) NOT NULL DEFAULT 0.32,
    "priceIncreasePct" DECIMAL(6,2) NOT NULL DEFAULT 3,
    "buildingType" TEXT NOT NULL DEFAULT '',
    "buildingYear" INTEGER,
    "roofType" TEXT NOT NULL DEFAULT '',
    "orientation" TEXT NOT NULL DEFAULT '',
    "tiltDeg" DECIMAL(5,1),
    "roofAreaM2" DECIMAL(8,1),
    "monumentProtected" BOOLEAN NOT NULL DEFAULT false,
    "buildingNote" TEXT NOT NULL DEFAULT '',
    "existingPvKwp" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "existingBatteryKwh" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "existingWallbox" BOOLEAN NOT NULL DEFAULT false,
    "existingHeating" TEXT NOT NULL DEFAULT '',
    "vatZeroEligible" BOOLEAN NOT NULL DEFAULT true,
    "vatDeductible" BOOLEAN NOT NULL DEFAULT false,
    "validUntil" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferVariant" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "specificYield" DECIMAL(8,1) NOT NULL DEFAULT 950,
    "yieldProvider" TEXT NOT NULL DEFAULT 'specific',
    "degradationPct" DECIMAL(6,2) NOT NULL DEFAULT 0.5,
    "horizonYears" INTEGER NOT NULL DEFAULT 20,
    "eegTariffEur" DECIMAL(8,4) NOT NULL DEFAULT 0.078,
    "postEegTariffEur" DECIMAL(8,4) NOT NULL DEFAULT 0.04,
    "opexEurPerYear" DECIMAL(12,2) NOT NULL DEFAULT 150,
    "batteryCyclesPerYear" INTEGER NOT NULL DEFAULT 220,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'BAR',
    "rebateNet" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "downPayment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "financeYears" INTEGER NOT NULL DEFAULT 15,
    "financeInterestPct" DECIMAL(6,2) NOT NULL DEFAULT 4.5,
    "instalmentCount" INTEGER NOT NULL DEFAULT 12,
    "instalmentIntervalMonths" INTEGER NOT NULL DEFAULT 1,
    "instalmentInterestPct" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "kwpOverride" DECIMAL(8,2),
    "kwpManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferLine" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "typeKey" TEXT,
    "section" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPriceNet" DECIMAL(12,2) NOT NULL,
    "purchasePriceNet" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "vatCategory" "VatCategory" NOT NULL,
    "specs" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "OfferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "userId" TEXT,
    "customerId" TEXT,
    "requestId" TEXT,
    "offerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL,
    "street" TEXT NOT NULL DEFAULT '',
    "zip" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "taxNumber" TEXT NOT NULL DEFAULT '',
    "vatId" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "bic" TEXT NOT NULL DEFAULT '',
    "logoStoredName" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1e5c42',
    "accentColor" TEXT NOT NULL DEFAULT '#c65b2e',
    "defaultSpecificYield" DECIMAL(8,1) NOT NULL DEFAULT 950,
    "defaultEegTariff" DECIMAL(8,4) NOT NULL DEFAULT 0.078,
    "defaultPostEeg" DECIMAL(8,4) NOT NULL DEFAULT 0.04,
    "defaultElectricityPrice" DECIMAL(8,4) NOT NULL DEFAULT 0.32,
    "defaultPriceIncrease" DECIMAL(6,2) NOT NULL DEFAULT 3,
    "defaultDegradation" DECIMAL(6,2) NOT NULL DEFAULT 0.5,
    "defaultHorizonYears" INTEGER NOT NULL DEFAULT 20,
    "defaultOpex" DECIMAL(12,2) NOT NULL DEFAULT 150,
    "defaultBatteryCycles" INTEGER NOT NULL DEFAULT 220,
    "offerValidityDays" INTEGER NOT NULL DEFAULT 30,
    "pdfPages" JSONB NOT NULL,
    "aboutText" TEXT NOT NULL,
    "legalText" TEXT NOT NULL,
    "coverSubtitle" TEXT NOT NULL DEFAULT 'Angebot für Ihre Energieversorgung',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_seedKey_key" ON "Customer"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "Request_seedKey_key" ON "Request"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "Request_number_key" ON "Request"("number");

-- CreateIndex
CREATE INDEX "Request_status_idx" ON "Request"("status");

-- CreateIndex
CREATE INDEX "Request_segment_idx" ON "Request"("segment");

-- CreateIndex
CREATE INDEX "Note_requestId_idx" ON "Note"("requestId");

-- CreateIndex
CREATE INDEX "Note_customerId_idx" ON "Note"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_seedKey_key" ON "CatalogItem"("seedKey");

-- CreateIndex
CREATE INDEX "CatalogItem_typeKey_idx" ON "CatalogItem"("typeKey");

-- CreateIndex
CREATE INDEX "CatalogItem_active_idx" ON "CatalogItem"("active");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanStage_seedKey_key" ON "KanbanStage"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_seedKey_key" ON "Offer"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_number_key" ON "Offer"("number");

-- CreateIndex
CREATE INDEX "Offer_stageId_idx" ON "Offer"("stageId");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE INDEX "OfferVariant_offerId_idx" ON "OfferVariant"("offerId");

-- CreateIndex
CREATE INDEX "OfferLine_variantId_idx" ON "OfferLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_seedKey_key" ON "Appointment"("seedKey");

-- CreateIndex
CREATE INDEX "Appointment_startAt_idx" ON "Appointment"("startAt");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "KanbanStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferVariant" ADD CONSTRAINT "OfferVariant_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferLine" ADD CONSTRAINT "OfferLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "OfferVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
