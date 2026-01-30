const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    const count = await prisma.market.count();
    console.log("✅ Connected. Market rows:", count);

    const markets = await prisma.market.findMany({
      where: {
        OR: [
          { title: { contains: "CZ", mode: "insensitive" } },
          { title: { contains: "pardon", mode: "insensitive" } },
          { title: { contains: "Binance", mode: "insensitive" } },
          { title: { contains: "Changpeng", mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true },
      take: 20,
    });

    console.log("Candidate markets found:", markets.length);
    for (const m of markets) console.log(m.id, "-", m.title);
  } catch (e) {
    console.error("❌ Error:", e?.message || e);
  } finally {
    await prisma.$disconnect();
  }
})();
