-- Add NFT-related fields to Clip table
ALTER TABLE "Clip" ADD COLUMN "royaltyBps" INTEGER;
ALTER TABLE "Clip" ADD COLUMN "metadataUri" TEXT;
ALTER TABLE "Clip" ADD COLUMN "mintAddress" TEXT;
