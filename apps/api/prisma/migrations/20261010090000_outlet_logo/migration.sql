-- The restaurant logo, stored like dish photos.
ALTER TABLE "outlets" ADD COLUMN "logo_id" UUID;
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
