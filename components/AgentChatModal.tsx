"use client";

import { useState, useEffect, useRef } from "react";
import type { FilteredCustomer, OutreachBundle, QueryPlan } from "@/lib/agent-workflow";

interface AgentChatModalProps {
  open: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  // Node progress log
  nodesExecuted?: string[];
  queryPlan?: QueryPlan | null;
  customers?: FilteredCustomer[];
  outreachBundles?: OutreachBundle[];
  error?: string | null;
  isStreaming?: boolean;
  timestamp: Date;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getCreditScoreColor(score: number) {
  if (score >= 800) return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
  if (score >= 700) return "text-blue-400 border-blue-500/20 bg-blue-500/10";
  if (score >= 600) return "text-amber-400 border-amber-500/20 bg-amber-500/10";
  return "text-red-400 border-red-500/20 bg-red-500/10";
}

export default function AgentChatModal({ open, onClose }: AgentChatModalProps) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"prospects" | "outreach">("prospects");

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize conversation with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Hello! I am your RM AI Agent. Ask me to find prospects, screen customers, or draft outreach templates.\n\nFor example:\n* \"Find high-value customers with a credit score above 750 who do not have a personal loan, and write WhatsApp templates.\"\n* \"Show me customers with monthly income over ₹60,000 in Mumbai.\"",
          timestamp: new Date(),
        },
      ]);
    }
  }, [messages.length]);

  // Scroll to bottom when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!open) return null;

  const handleResetSession = () => {
    setThreadId(null);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: "Hello! I am your RM AI Agent. Ask me to find prospects, screen customers, or draft outreach templates.\n\nFor example:\n* \"Find high-value customers with a credit score above 750 who do not have a personal loan, and write WhatsApp templates.\"\n* \"Show me customers with monthly income over ₹60,000 in Mumbai.\"",
        timestamp: new Date(),
      },
    ]);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const userText = userInput.trim();
    setUserInput("");

    // 1. Add User Message
    const userMsgId = `msg-user-${Date.now()}`;
    const newUserMessage: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: userText,
      timestamp: new Date(),
    };

    // 2. Add Streaming Assistant Placeholder
    const assistantMsgId = `msg-agent-${Date.now()}`;
    const newAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      isStreaming: true,
      nodesExecuted: [],
      queryPlan: null,
      customers: [],
      outreachBundles: [],
      error: null,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMessage, newAssistantMessage]);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userText,
          threadId: threadId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed with server status ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error("Cannot decode response stream");
      }

      let buffer = "";
      let done = false;
      let currentEvent = "";

      while (!done) {
        const { value, done: doneChunk } = await reader.read();
        done = doneChunk;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("event: ")) {
              currentEvent = trimmed.slice(7).trim();
            } else if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              try {
                const data = JSON.parse(dataStr);

                // Handle done event side effects outside of setMessages
                if (currentEvent === "done" && data.threadId) {
                  setThreadId(data.threadId);
                }

                // Capture currentEvent in block scope to avoid async closure issues
                const eventType = currentEvent;

                setMessages((prev) => {
                  return prev.map((m) => {
                    if (m.id !== assistantMsgId) return m;

                    const updated = { ...m };
                    if (eventType === "node") {
                      if (data.node && !updated.nodesExecuted?.includes(data.node)) {
                        updated.nodesExecuted = [...(updated.nodesExecuted || []), data.node];
                      }
                    } else if (eventType === "queryPlan") {
                      updated.queryPlan = data;
                    } else if (eventType === "customers") {
                      updated.customers = data;
                    } else if (eventType === "outreach") {
                      updated.outreachBundles = data;
                    } else if (eventType === "message") {
                      updated.content = data.content;
                    } else if (eventType === "error") {
                      updated.error = data.error;
                    } else if (eventType === "done") {
                      if (data.values) {
                        if (data.values.error) updated.error = data.values.error;
                        if (data.values.queryPlan) updated.queryPlan = data.values.queryPlan;
                        if (data.values.customers) updated.customers = data.values.customers;
                        if (data.values.outreachBundles) updated.outreachBundles = data.values.outreachBundles;
                        
                        // Extract final message content as fallback if it was not populated during streaming
                        if (data.values.messages && data.values.messages.length > 0) {
                          const lastMsg = data.values.messages[data.values.messages.length - 1];
                          const lastContent = lastMsg.kwargs?.content || lastMsg.content;
                          if (lastContent && !updated.content) {
                            updated.content = lastContent;
                          }
                        }
                      }
                    }
                    return updated;
                  });
                });
              } catch (err) {
                console.error("Error parsing streaming chunk data", err);
              }
              currentEvent = "";
            }
          }
        }
      }

      // Mark stream completion
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, isStreaming: false, error: errorMessage || "Something went wrong during workflow run" }
            : m
        )
      );
    }
  };

  // Find the most recent assistant message with detailed agent context to display in the Right Inspector Panel
  const activeInspectorMessage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && (m.nodesExecuted?.length || m.queryPlan || m.customers?.length || m.error));

  const isCurrentMessageStreaming = activeInspectorMessage?.isStreaming || false;
  const nodes = activeInspectorMessage?.nodesExecuted || [];
  const queryPlan = activeInspectorMessage?.queryPlan || null;
  const prospects = activeInspectorMessage?.customers || [];
  const outreach = activeInspectorMessage?.outreachBundles || [];
  const inspectorError = activeInspectorMessage?.error || null;

  // Watch for changes in outreach options to toggle active tab
  const hasOutreach = outreach.length > 0;
  const hasProspects = prospects.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[8px] flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[1200px] h-[90vh] md:h-[85vh] bg-gradient-to-br from-[#131424]/95 to-[#0b0c16]/95 border border-white/[0.08] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6),_0_0_0_1px_rgba(99,102,241,0.1)] flex flex-col md:flex-row overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Side: Conversation Chat Pane */}
        <div className="w-full md:w-[55%] flex flex-col h-full border-b md:border-b-0 md:border-r border-white/[0.06]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#6366f1]/10 border border-[#6366f1]/20 flex items-center justify-center text-[#8b5cf6] shadow-[0_2px_10px_rgba(99,102,241,0.1)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </div>
              <div>
                <h2 className="text-[0.95rem] font-bold text-[#f1f5f9] m-0">RM AI Assistant</h2>
                <p className="text-[0.72rem] text-[#64748b] m-0">Powered by LangGraph & Gemini</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {threadId && (
                <button
                  onClick={handleResetSession}
                  className="px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12] rounded-lg text-[0.75rem] font-medium text-[#94a3b8] cursor-pointer flex items-center gap-1 transition-all duration-150"
                  title="Reset conversation session memory"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M16 3h5v5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M8 21H3v-5" />
                  </svg>
                  New Thread
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center bg-white/[0.04] border border-white/[0.08] rounded-lg text-[#64748b] cursor-pointer transition-all duration-150 hover:bg-white/10 hover:text-[#e2e8f0]"
                aria-label="Close chat"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Chat Logs List */}
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5 custom-scrollbar bg-black/10">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-1.5 text-[0.72rem] text-[#64748b] font-medium px-1">
                      <span>{isUser ? "You" : "RM Agent"}</span>
                      <span>•</span>
                      <span>
                        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <div
                      className={`px-4 py-3 rounded-2xl text-[0.85rem] leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? "bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-tr-none shadow-[0_4px_12px_rgba(99,102,241,0.2)]"
                          : "bg-white/[0.04] border border-white/[0.06] text-[#e2e8f0] rounded-tl-none"
                      }`}
                    >
                      {msg.content}

                      {/* Display Status in line if it is currently executing the workflow */}
                      {msg.role === "assistant" && msg.isStreaming && !msg.content && (
                        <div className="flex items-center gap-2 py-1 text-[#94a3b8]">
                          <span className="w-4 h-4 border-2 border-[#6366f1]/25 border-t-[#6366f1] rounded-full animate-spin" />
                          <span>AI Agent is running workspace tools...</span>
                        </div>
                      )}

                      {/* inline simple error display */}
                      {msg.role === "assistant" && msg.error && (
                        <div className="mt-2 text-red-400 font-semibold flex items-center gap-1.5 text-[0.8rem] bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <span>{msg.error}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Form Input */}
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-white/[0.06] flex items-center gap-2 bg-[#0c0d18]/90"
          >
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={isCurrentMessageStreaming}
              placeholder={
                isCurrentMessageStreaming
                  ? "Agent workflow in progress..."
                  : "Find high income clients for mutual funds..."
              }
              className="flex-1 px-4 py-[0.7rem] bg-white/[0.03] border border-white/[0.08] rounded-xl text-[#e2e8f0] text-[0.85rem] outline-none transition-all duration-200 placeholder:text-[#475569] focus:border-[#6366f1]/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.06)] disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={isCurrentMessageStreaming || !userInput.trim()}
              className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white border-0 rounded-xl cursor-pointer transition-all duration-200 shadow-[0_2px_8px_rgba(99,102,241,0.25)] hover:not-disabled:-translate-y-[0.5px] hover:not-disabled:shadow-[0_4px_14px_rgba(99,102,241,0.35)] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isCurrentMessageStreaming ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </form>
        </div>

        {/* Right Side: Agent Workspace & Inspector Board */}
        <div className="w-full md:w-[45%] flex flex-col h-full bg-[#090a12]/50">
          <div className="px-5 py-4 border-b border-white/[0.06] bg-white/[0.01]">
            <h3 className="text-[0.85rem] font-bold text-[#f1f5f9] uppercase tracking-[0.06em] m-0">
              Agent Workspace Monitor
            </h3>
            <p className="text-[0.72rem] text-[#64748b] m-0">Live graph actions and execution data</p>
          </div>

          {!activeInspectorMessage ? (
            /* Empty Inspector State */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#475569]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="mb-3 text-[#334155]"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="9" x2="15" y2="9" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
              <p className="text-[0.82rem] font-medium text-[#64748b] mb-1">Inspector Idle</p>
              <p className="text-[0.75rem] max-w-[240px] m-0">
                Submit an AI query on the left to inspect variables and output records in real-time.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Dynamic Execution Progress Graph Track */}
              <div className="px-5 py-4 bg-white/[0.02] border-b border-white/[0.04] space-y-3">
                <h4 className="text-[0.72rem] font-semibold text-[#8b5cf6] uppercase tracking-wider mt-0 mb-2">
                  Graph Node Execution
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {/* Node 1: Interpret Query */}
                  <div
                    className={`px-2.5 py-1.5 rounded-lg border text-[0.72rem] flex flex-col gap-1 transition-all duration-200 ${
                      nodes.includes("interpret_query")
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium"
                        : isCurrentMessageStreaming && nodes.length === 0
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse font-medium"
                        : "bg-white/[0.02] border-white/[0.06] text-[#475569]"
                    }`}
                  >
                    <span>1. Interpret Query</span>
                    <span className="text-[0.62rem] opacity-80">
                      {nodes.includes("interpret_query") ? "Completed" : isCurrentMessageStreaming && nodes.length === 0 ? "Running..." : "Idle"}
                    </span>
                  </div>

                  {/* Node 2: Fetch & Filter */}
                  <div
                    className={`px-2.5 py-1.5 rounded-lg border text-[0.72rem] flex flex-col gap-1 transition-all duration-200 ${
                      nodes.includes("fetch_and_filter")
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium"
                        : isCurrentMessageStreaming && nodes.length === 1
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse font-medium"
                        : "bg-white/[0.02] border-white/[0.06] text-[#475569]"
                    }`}
                  >
                    <span>2. Fetch & Filter</span>
                    <span className="text-[0.62rem] opacity-80">
                      {nodes.includes("fetch_and_filter") ? "Completed" : isCurrentMessageStreaming && nodes.length === 1 ? "Running..." : "Idle"}
                    </span>
                  </div>

                  {/* Node 3: Generate Outreach */}
                  <div
                    className={`px-2.5 py-1.5 rounded-lg border text-[0.72rem] flex flex-col gap-1 transition-all duration-200 ${
                      nodes.includes("generate_outreach")
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium"
                        : isCurrentMessageStreaming && nodes.length === 2 && queryPlan?.generateOutreach
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse font-medium"
                        : queryPlan && !queryPlan.generateOutreach
                        ? "bg-white/[0.01] border-dashed border-white/[0.06] text-[#334155]"
                        : "bg-white/[0.02] border-white/[0.06] text-[#475569]"
                    }`}
                  >
                    <span>3. Outreach Templates</span>
                    <span className="text-[0.62rem] opacity-80">
                      {queryPlan && !queryPlan.generateOutreach
                        ? "Skipped"
                        : nodes.includes("generate_outreach")
                        ? "Completed"
                        : isCurrentMessageStreaming && nodes.length === 2 && queryPlan?.generateOutreach
                        ? "Running..."
                        : "Idle"}
                    </span>
                  </div>

                  {/* Node 4: Present Results */}
                  <div
                    className={`px-2.5 py-1.5 rounded-lg border text-[0.72rem] flex flex-col gap-1 transition-all duration-200 ${
                      nodes.includes("present_results")
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium"
                        : isCurrentMessageStreaming &&
                          ((queryPlan?.generateOutreach && nodes.length === 3) ||
                            (!queryPlan?.generateOutreach && nodes.length === 2))
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse font-medium"
                        : "bg-white/[0.02] border-white/[0.06] text-[#475569]"
                    }`}
                  >
                    <span>4. Present Results</span>
                    <span className="text-[0.62rem] opacity-80">
                      {nodes.includes("present_results") ? "Completed" : "Idle"}
                    </span>
                  </div>
                </div>

                {/* Show parsed query plan parameters if interpret_query node finished */}
                {queryPlan && (
                  <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-[0.78rem] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748b] font-medium text-[0.7rem] uppercase tracking-wider">
                        Interpreted Query Plan
                      </span>
                      <span className="text-[#94a3b8] text-[0.7rem] font-semibold bg-white/[0.06] px-1.5 py-0.5 rounded">
                        Limit: {queryPlan.limit}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {queryPlan.filters.length === 0 ? (
                        <span className="text-[#475569] text-[0.75rem]">No filter parameters extracted</span>
                      ) : (
                        queryPlan.filters.map((f, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#6366f1]/10 border border-[#6366f1]/20 rounded-md text-[0.7rem] font-mono text-[#a5b4fc]"
                          >
                            <span className="opacity-60">{f.field}</span>
                            <span className="text-[#818cf8] font-bold">{f.operator}</span>
                            <span className="text-white font-medium">{String(f.value)}</span>
                          </span>
                        ))
                      )}
                      {queryPlan.sortBy && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-[0.7rem] font-mono text-amber-300">
                          <span className="opacity-60">Sort:</span>
                          <span>{queryPlan.sortBy.field}</span>
                          <span className="opacity-60 font-bold">({queryPlan.sortBy.direction})</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Node execution runtime errors */}
              {inspectorError && (
                <div className="m-4 p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl flex gap-3 text-red-400 text-[0.8rem]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="flex-shrink-0"
                  >
                    <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div>
                    <span className="font-bold block mb-0.5">Execution Failed</span>
                    <span>{inspectorError}</span>
                  </div>
                </div>
              )}

              {/* Result Area */}
              {hasProspects ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Inspector Tabs */}
                  <div className="px-5 border-b border-white/[0.06] bg-white/[0.01] flex items-center justify-between">
                    <div className="flex gap-4">
                      <button
                        onClick={() => setActiveTab("prospects")}
                        className={`py-3.5 text-[0.78rem] font-bold border-b-2 transition-all duration-150 cursor-pointer ${
                          activeTab === "prospects"
                            ? "border-[#6366f1] text-[#f8fafc]"
                            : "border-transparent text-[#64748b] hover:text-[#94a3b8]"
                        }`}
                      >
                        Prospects ({prospects.length})
                      </button>
                      {hasOutreach && (
                        <button
                          onClick={() => setActiveTab("outreach")}
                          className={`py-3.5 text-[0.78rem] font-bold border-b-2 transition-all duration-150 cursor-pointer ${
                            activeTab === "outreach"
                              ? "border-[#6366f1] text-[#f8fafc]"
                              : "border-transparent text-[#64748b] hover:text-[#94a3b8]"
                          }`}
                        >
                          Outreach Templates ({outreach.length})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tab Contents */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {activeTab === "prospects" ? (
                      /* Prospects list */
                      prospects.map((customer) => (
                        <div
                          key={customer.id}
                          className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/[0.1] transition-all duration-150 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center font-bold text-white text-[0.8rem]">
                                {customer.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h5 className="text-[0.85rem] font-bold text-[#f1f5f9] m-0">
                                  {customer.name}
                                </h5>
                                <p className="text-[0.7rem] text-[#64748b] m-0">
                                  {customer.email || "No email"} • {customer.phone || "No phone"}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 border rounded text-[0.7rem] font-bold font-mono ${getCreditScoreColor(
                                customer.creditScore
                              )}`}
                              title="Credit Score"
                            >
                              CS: {customer.creditScore}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 py-2 border-y border-white/[0.04] text-[0.75rem]">
                            <div>
                              <span className="text-[#64748b] block text-[0.65rem] uppercase">Monthly Income</span>
                              <span className="font-mono text-[#cbd5e1] font-semibold">
                                {formatCurrency(customer.income)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#64748b] block text-[0.65rem] uppercase">Idle Balance</span>
                              <span className="font-mono text-[#cbd5e1] font-semibold">
                                {formatCurrency(customer.idleBalance)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#64748b] block text-[0.65rem] uppercase">EMI Debt Ratio</span>
                              <span className="font-mono text-[#cbd5e1] font-semibold">
                                {(customer.existingEmiRatio * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>

                          <div className="text-[0.75rem] text-[#94a3b8] bg-[#6366f1]/[0.03] border border-[#6366f1]/10 px-3 py-2 rounded-lg leading-relaxed">
                            <span className="font-semibold text-[#818cf8] block text-[0.65rem] uppercase mb-0.5">
                              Match Reasoning & Score ({customer.conversionScore}/90)
                            </span>
                            {customer.reasoning || "Matched database criteria."}
                          </div>
                        </div>
                      ))
                    ) : (
                      /* Outreach messages list */
                      outreach.map((bundle) => {
                        const copyId = `outreach-${bundle.customer.id}`;
                        const phone = bundle.customer.phone || "";
                        // Format phone: remove spaces/plus
                        const rawPhone = phone.replace(/[^0-9]/g, "");
                        const waUrl = `https://web.whatsapp.com/send?phone=${rawPhone}&text=${encodeURIComponent(
                          bundle.whatsappMessage
                        )}`;

                        return (
                          <div
                            key={bundle.customer.id}
                            className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <h5 className="text-[0.85rem] font-bold text-[#f1f5f9] m-0">
                                  Outreach to: {bundle.customer.name}
                                </h5>
                                <span className="inline-block px-2 py-0.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 rounded text-[0.65rem] text-[#a78bfa] mt-1">
                                  Product: {bundle.productRecommendation}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleCopy(bundle.whatsappMessage, copyId)}
                                  className="p-1.5 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12] rounded-lg text-[#94a3b8] hover:text-white cursor-pointer transition-all duration-150 flex items-center gap-1 text-[0.7rem]"
                                  title="Copy text to clipboard"
                                >
                                  {copiedId === copyId ? (
                                    <>
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        className="text-emerald-400"
                                      >
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span className="text-emerald-400">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                      >
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                      </svg>
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>

                                {phone && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 rounded-lg text-emerald-400 hover:text-emerald-300 transition-all duration-150 flex items-center gap-1 text-[0.7rem] decoration-none"
                                    title="Send message via WhatsApp Web"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                    </svg>
                                    <span>WhatsApp</span>
                                  </a>
                                )}
                              </div>
                            </div>

                            <div className="bg-black/25 border border-white/[0.04] p-3 rounded-lg text-[0.78rem] font-mono leading-relaxed text-[#cbd5e1] whitespace-pre-wrap select-text">
                              {bundle.whatsappMessage}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* No Results Yet but active run has interpret details */
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#475569] bg-white/[0.01]">
                  {isCurrentMessageStreaming ? (
                    <div className="space-y-3">
                      <div className="w-8 h-8 border-3 border-[#6366f1]/20 border-t-[#6366f1] rounded-full animate-spin mx-auto" />
                      <p className="text-[0.8rem] font-medium text-[#94a3b8]">AI Agent is compiling results...</p>
                      <p className="text-[0.72rem] max-w-[250px] mx-auto">
                        Evaluating CRM heuristics and generating templates. Output will appear here momentarily.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="mx-auto text-[#334155]"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <p className="text-[0.8rem] font-medium text-[#64748b]">No Prospects Matched</p>
                      <p className="text-[0.72rem] max-w-[240px] mx-auto">
                        The search query did not yield database results. Try requesting broader filters (e.g. higher income limit or lower credit scores).
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
