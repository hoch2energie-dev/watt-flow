-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "locationLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "locationSource" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "longitude" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "OfferVariant" ADD COLUMN     "yieldAnnualKwh" DECIMAL(12,1),
ADD COLUMN     "yieldCalculatedAt" TIMESTAMP(3),
ADD COLUMN     "yieldKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "yieldMonthlyKwh" JSONB,
ADD COLUMN     "yieldNotice" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "RoofFace" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "kwp" DECIMAL(8,3) NOT NULL,
    "tiltDeg" DECIMAL(5,1) NOT NULL,
    "azimuthDeg" DECIMAL(6,1) NOT NULL,
    "mounting" TEXT NOT NULL DEFAULT 'gebaeude',
    "lossesPercent" DECIMAL(5,1) NOT NULL DEFAULT 14,
    "geometry" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoofFace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PvgisCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PvgisCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodeCache" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "label" TEXT NOT NULL DEFAULT '',
    "found" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoofFace_variantId_idx" ON "RoofFace"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PvgisCache_cacheKey_key" ON "PvgisCache"("cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodeCache_query_key" ON "GeocodeCache"("query");

-- AddForeignKey
ALTER TABLE "RoofFace" ADD CONSTRAINT "RoofFace_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "OfferVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
