import "dotenv/config";
import { createAgentWorkflow } from "../lib/agent-workflow";
import { prisma } from "../lib/prisma";

async function main() {
  const app = createAgentWorkflow();
  const threadId = "test-thread-" + Math.random().toString(36).substring(2, 9);

  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  console.log("=== FIRST RUN ===");
  const input1 = {
    messages: [{ role: "user", content: "Show me customers with credit score less than 650" }],
  };

  const stream1 = await app.stream(input1, {
    ...config,
    streamMode: "updates",
  });

  for await (const update of stream1) {
    console.log("Update:", JSON.stringify(update));
  }

  const state1 = await app.getState(config);
  console.log("State after run 1 customers:");
  state1.values.customers?.forEach((c: any) => {
    console.log(`- ${c.name} (Credit Score: ${c.creditScore})`);
  });

  console.log("\n=== SECOND RUN ===");
  const input2 = {
    messages: [{ role: "user", content: "Write outreach templates for them" }],
  };

  const stream2 = await app.stream(input2, {
    ...config,
    streamMode: "updates",
  });

  for await (const update of stream2) {
    // we don't need to print all updates, just final state is fine
  }

  const state2 = await app.getState(config);
  console.log("State after run 2 customers:");
  state2.values.customers?.forEach((c: any) => {
    console.log(`- ${c.name} (Credit Score: ${c.creditScore})`);
  });
}

main()
  .catch(err => {
    console.error("Workflow run error:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
