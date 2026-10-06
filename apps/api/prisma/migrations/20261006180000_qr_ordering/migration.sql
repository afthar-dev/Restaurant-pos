-- CreateEnum
CREATE TYPE "QrSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_created_by_id_fkey";

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "qr_sessions" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "qr_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_submissions" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "status" "QrSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "lines" JSONB NOT NULL,
    "note" TEXT,
    "total" INTEGER NOT NULL,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "qr_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qr_sessions_token_hash_key" ON "qr_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "qr_sessions_table_id_ended_at_idx" ON "qr_sessions"("table_id", "ended_at");

-- CreateIndex
CREATE INDEX "qr_submissions_order_id_status_idx" ON "qr_submissions"("order_id", "status");

-- CreateIndex
CREATE INDEX "qr_submissions_outlet_id_status_idx" ON "qr_submissions"("outlet_id", "status");

-- CreateIndex
CREATE INDEX "qr_submissions_session_id_created_at_idx" ON "qr_submissions"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_submissions" ADD CONSTRAINT "qr_submissions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_submissions" ADD CONSTRAINT "qr_submissions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_submissions" ADD CONSTRAINT "qr_submissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_submissions" ADD CONSTRAINT "qr_submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "qr_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_submissions" ADD CONSTRAINT "qr_submissions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

