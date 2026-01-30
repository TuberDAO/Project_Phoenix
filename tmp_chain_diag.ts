import { PrismaClient } from "@prisma/client";
import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";

const prisma = new PrismaClient();
const rpc = process.env.CHAIN_RPC_URL || "https://polygon-rpc.com";
const client = createPublicClient({ chain: polygon, transport: http(rpc) });

async function main() {
  const unenriched = await prisma.bet.findMany({
    where: { blockNumber: 0 },
    select: { id: true, txHash: true },
    take: 5,
    orderBy: { timestamp: "desc" },
  });

  const enriched = await prisma.bet.findMany({
    where: { blockNumber: { not: 0 } },
    select: { id: true, txHash: true, blockNumber: true },
    take: 5,
    orderBy: { timestamp: "desc" },
  });

  console.log("RPC:", rpc);

  console.log("\nLatest UNENRICHED txHashes:");
  for (const b of unenriched) {
    try {
      const receipt = await client.getTransactionReceipt({
        hash: b.txHash as `0x${string}`,
      });
      console.log(b.txHash.slice(0, 18) + "...", "FOUND block", Number(receipt.blockNumber));
    } catch (e: any) {
      console.log(
        b.txHash.slice(0, 18) + "...",
        "NOT FOUND:",
        e?.shortMessage || e?.message || String(e)
      );
    }
  }

  console.log("\nLatest ENRICHED txHashes:");
  for (const b of enriched) {
    console.log(b.txHash.slice(0, 18) + "...", "blockNumber in DB", b.blockNumber);
  }
}

main()
  .catch((err) => {
    console.error("DIAG FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
