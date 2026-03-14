import { prisma } from "../src/lib/db";
import { runScanJob } from "../src/lib/services/scanService";

async function main() {
  const result = await runScanJob("render-cron");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
