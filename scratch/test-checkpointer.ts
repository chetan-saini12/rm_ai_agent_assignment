import "dotenv/config";
import { PrismaCheckpointer } from "../lib/prisma-checkpointer";
import { prisma } from "../lib/prisma";

async function main() {
  const threadId = "thread-5xrzl0xxj";

  console.log("Direct Prisma query for thread:", threadId);
  const cps = await prisma.checkpoint.findMany({
    where: { threadId }
  });
  console.log("Total checkpoints in DB for thread:", cps.length);
  cps.forEach(cp => {
    console.log(`- ID: ${cp.checkpointId}, Namespace: "${cp.checkpointNs}", CreatedAt: ${cp.createdAt.toISOString()}`);
  });

  const checkpointer = new PrismaCheckpointer();
  const config = {
    configurable: {
      thread_id: threadId,
      checkpoint_ns: "",
    }
  };

  try {
    console.log("Calling getTuple...");
    const tuple = await checkpointer.getTuple(config);
    console.log("Tuple returned successfully:", tuple);
  } catch (err: any) {
    console.error("Error inside getTuple:", err);
  }
}

main()
  .catch(err => {
    console.error("Error in test-checkpointer:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
