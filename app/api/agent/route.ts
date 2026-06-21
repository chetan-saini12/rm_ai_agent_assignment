import { type NextRequest } from "next/server";
import { createAgentWorkflow } from "@/lib/agent-workflow";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message, threadId: inputThreadId } = body;

        if (!message || typeof message !== "string" || message.trim().length === 0) {
            return Response.json({ error: "Message is required" }, { status: 400 });
        }

        const threadId = inputThreadId || `thread-${Math.random().toString(36).substring(2, 11)}`;
        const app = createAgentWorkflow();

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (event: string, data: any) => {
                    controller.enqueue(
                        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
                    );
                };

                try {
                    const config = {
                        configurable: {
                            thread_id: threadId,
                        },
                    };

                    const input = {
                        messages: [{ role: "user", content: message }],
                    };

                    // Stream intermediate node updates
                    const eventStream = await app.stream(input, {
                        ...config,
                        streamMode: "updates",
                    });

                    for await (const update of eventStream) {
                        const nodeName = Object.keys(update)[0];
                        const nodeValue = (update as any)[nodeName];

                        sendEvent("node", { node: nodeName });

                        if (nodeName === "interpret_query" && nodeValue.queryPlan) {
                            sendEvent("queryPlan", nodeValue.queryPlan);
                        } else if (nodeName === "fetch_and_filter" && nodeValue.customers) {
                            sendEvent("customers", nodeValue.customers);
                        } else if (nodeName === "generate_outreach" && nodeValue.outreachBundles) {
                            sendEvent("outreach", nodeValue.outreachBundles);
                        } else if (nodeName === "present_results" && nodeValue.messages) {
                            const lastMsg = nodeValue.messages[nodeValue.messages.length - 1];
                            sendEvent("message", { content: lastMsg.content });
                        }

                        if (nodeValue.error) {
                            sendEvent("error", { error: nodeValue.error });
                        }
                    }

                    // Fetch final state snapshot
                    const finalState = await app.getState(config);
                    sendEvent("done", {
                        threadId,
                        values: finalState.values,
                    });

                } catch (err: any) {
                    console.error("Agent execution failed inside SSE stream:", err);
                    sendEvent("error", { error: err.message || "Failed to execute agent workflow" });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("POST /api/agent error:", error);
        return Response.json({ error: "Failed to initialize agent request" }, { status: 500 });
    }
}
