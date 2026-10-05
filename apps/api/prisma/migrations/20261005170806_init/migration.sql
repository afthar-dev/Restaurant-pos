-- CreateEnum
CREATE TYPE "TaxScheme" AS ENUM ('REGULAR', 'COMPOSITION', 'NONE');

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "tax_scheme" "TaxScheme" NOT NULL DEFAULT 'REGULAR',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);
