-- PIN failures get their own counter; password failures move to a per-address table.
ALTER TABLE "users" RENAME COLUMN "failed_login_count" TO "pin_failed_count";
ALTER TABLE "users" RENAME COLUMN "locked_until" TO "pin_locked_until";

-- CreateTable
CREATE TABLE "password_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ip" TEXT NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "password_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "used_override_tokens" (
    "jti" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "used_override_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_attempts_user_id_ip_key" ON "password_attempts"("user_id", "ip");

-- AddForeignKey
ALTER TABLE "password_attempts" ADD CONSTRAINT "password_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
