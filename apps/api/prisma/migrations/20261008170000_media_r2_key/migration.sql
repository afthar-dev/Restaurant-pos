-- Photos now live in Cloudflare R2 (or a local folder); the row keeps only the object key.
ALTER TABLE "media" DROP COLUMN "data",
ADD COLUMN     "key" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "media_key_key" ON "media"("key");
