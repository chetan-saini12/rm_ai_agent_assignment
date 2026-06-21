import { Annotation, MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { prisma } from "./prisma";
import { PrismaCheckpointer } from "./prisma-checkpointer";

// ── Types ───────────────────────────────────────────────────────────
export interface FilteredCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  income: number;
  creditScore: number;
  idleBalance: number;
  existingEmiRatio: number;
  existingProducts: string[];
  demographics: any;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  conversionScore: number;
  reasoning: string;
}

export interface OutreachBundle {
  customer: FilteredCustomer;
  productRecommendation: string;
  whatsappMessage: string;
}

export interface QueryPlan {
  filters: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
  sortBy?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit: number;
  generateOutreach: boolean;
}

// ── Schemas ─────────────────────────────────────────────────────────
const FilterSchema = z.object({
  field: z.string().describe("The field name to filter on (e.g. 'creditScore', 'income', 'idleBalance', 'existingEmiRatio', 'existingProducts', 'demographics.age', 'demographics.gender', 'demographics.city', 'demographics.occupation')"),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains", "includes", "not_includes"]).describe("Comparison operator"),
  value: z.any().describe("The comparison value (e.g. 750, 50000, 'personal_loan', 'Male')"),
});

const QueryPlanSchema = z.object({
  filters: z.array(FilterSchema).describe("Dynamic search and selection filters"),
  sortBy: z.object({
    field: z.string().describe("The field to sort results by (e.g. 'creditScore', 'income', 'conversion_score')"),
    direction: z.enum(["asc", "desc"]).describe("Sorting order direction"),
  }).optional().describe("Optional results sorting config"),
  limit: z.number().default(10).describe("Maximum prospects to retrieve"),
  generateOutreach: z.boolean().default(false).describe("Whether the user requested personalized messaging campaigns/outreach templates"),
});

// ── Helpers ─────────────────────────────────────────────────────────
function mapFieldName(field: string): string {
  const mapping: Record<string, string> = {
    credit_score: "creditScore",
    existing_products: "existingProducts",
    idle_balance: "idleBalance",
    existing_emi_ratio: "existingEmiRatio",
  };
  return mapping[field] ?? field;
}

function applyOperator(customerValue: any, operator: string, filterValue: any): boolean {
  if (customerValue === undefined || customerValue === null) return false;

  switch (operator) {
    case "eq":
      return String(customerValue).toLowerCase() === String(filterValue).toLowerCase();
    case "neq":
      return String(customerValue).toLowerCase() !== String(filterValue).toLowerCase();
    case "gt":
      return Number(customerValue) > Number(filterValue);
    case "gte":
      return Number(customerValue) >= Number(filterValue);
    case "lt":
      return Number(customerValue) < Number(filterValue);
    case "lte":
      return Number(customerValue) <= Number(filterValue);
    case "contains":
      return String(customerValue).toLowerCase().includes(String(filterValue).toLowerCase());
    case "not_contains":
      return !String(customerValue).toLowerCase().includes(String(filterValue).toLowerCase());
    case "includes":
      if (Array.isArray(customerValue)) {
        return customerValue.map(v => String(v).toLowerCase()).includes(String(filterValue).toLowerCase());
      }
      return false;
    case "not_includes":
      if (Array.isArray(customerValue)) {
        return !customerValue.map(v => String(v).toLowerCase()).includes(String(filterValue).toLowerCase());
      }
      return true;
    default:
      return false;
  }
}

// Deterministic Scoring Heuristics
function scoreConversion(customer: any): { score: number; reasoning: string[] } {
  let score = 0;
  const reasoning: string[] = [];

  // Income: monthly income > 50000 -> +20
  if (customer.income > 50000) {
    score += 20;
    reasoning.push(`High monthly income of ₹${customer.income.toLocaleString("en-IN")} (+20)`);
  }

  // Credit score > 750 -> +25
  if (customer.creditScore > 750) {
    score += 25;
    reasoning.push(`Strong credit score of ${customer.creditScore} (+25)`);
  }

  // Doesn't have 'personal_loan' -> +20
  if (!customer.existingProducts.includes("personal_loan")) {
    score += 20;
    reasoning.push(`No existing personal loan (+20)`);
  }

  // Recent salary credit (transaction type 'salary_credit') -> +15
  const hasSalaryCredit = customer.transactions?.some(
    (t: any) => t.type === "salary_credit"
  );
  if (hasSalaryCredit) {
    score += 15;
    reasoning.push(`Verifiable monthly salary credit (+15)`);
  }

  // Idle balance > 100000 -> +10
  if (customer.idleBalance > 100000) {
    score += 10;
    reasoning.push(`Significant idle account balance of ₹${customer.idleBalance.toLocaleString("en-IN")} (+10)`);
  }

  // Negative signals:
  // Existing EMI ratio > 0.5 -> -20
  if (customer.existingEmiRatio > 0.5) {
    score -= 20;
    reasoning.push(`High debt-to-income EMI ratio of ${(customer.existingEmiRatio * 100).toFixed(0)}% (-20)`);
  }

  // Last contacted within last 30 days -> -10
  if (customer.lastContactedAt) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (new Date(customer.lastContactedAt) > thirtyDaysAgo) {
      score -= 10;
      reasoning.push(`Recently contacted on ${new Date(customer.lastContactedAt).toLocaleDateString("en-IN")} (-10)`);
    }
  }

  return { score, reasoning };
}

// ── Agent Tools Creation Function ──────────────────────────────────
export function createAgentTools() {
  const interpretQueryTool = tool(
    async ({ query }) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not configured.");

      const model = new ChatGoogleGenerativeAI({
        model: "gemini-3.1-flash-lite",
        apiKey,
        temperature: 0,
      });
      const structuredModel = model.withStructuredOutput(QueryPlanSchema);
      const response = await structuredModel.invoke([
        {
          role: "system",
          content: "You are a banking RM assistant. Interpret the relationship manager's query and extract filtering/sorting parameters.",
        },
        {
          role: "user",
          content: query,
        },
      ]);
      return response;
    },
    {
      name: "interpretQuery",
      description: "Converts natural language CRM search queries into structured filtering parameters.",
      schema: z.object({ query: z.string() }),
    }
  );

  const fetchAndFilterTool = tool(
    async (queryPlan) => {
      const dbCustomers = await prisma.customer.findMany({
        include: {
          transactions: true,
        },
      });

      let filtered = dbCustomers.map((c) => {
        const { score, reasoning } = scoreConversion(c);
        return {
          ...c,
          conversionScore: score,
          conversionReasoning: reasoning.join(", "),
          reasoning: "",
        };
      });

      if (queryPlan.filters && queryPlan.filters.length > 0) {
        filtered = filtered.filter((c) => {
          return queryPlan.filters.every((f) => {
            const mappedField = mapFieldName(f.field);
            let customerValue: any;
            if (mappedField.startsWith("demographics.")) {
              const sub = mappedField.replace("demographics.", "");
              customerValue = c.demographics && typeof c.demographics === "object"
                ? (c.demographics as any)[sub]
                : undefined;
            } else {
              customerValue = (c as any)[mappedField];
            }

            return applyOperator(customerValue, f.operator, f.value);
          });
        });
      }

      const sortBy = queryPlan.sortBy;
      if (sortBy) {
        const mappedField = mapFieldName(sortBy.field);
        const direction = sortBy.direction === "desc" ? -1 : 1;

        filtered.sort((a, b) => {
          let valA = mappedField === "conversion_score" || mappedField === "conversionScore"
            ? a.conversionScore
            : (a as any)[mappedField];
          let valB = mappedField === "conversion_score" || mappedField === "conversionScore"
            ? b.conversionScore
            : (b as any)[mappedField];

          if (valA === undefined) return 1 * direction;
          if (valB === undefined) return -1 * direction;

          if (typeof valA === "string" && typeof valB === "string") {
            return valA.localeCompare(valB) * direction;
          }
          return (valA - valB) * direction;
        });
      } else {
        filtered.sort((a, b) => b.conversionScore - a.conversionScore);
      }

      const limit = queryPlan.limit ?? 10;
      const sliced = filtered.slice(0, limit);

      return sliced.map((c) => {
        const matchedFilters = queryPlan.filters.map(f => `${f.field} ${f.operator} ${f.value}`).join(", ");
        const reasoningText = `Matched criteria [${matchedFilters}]. Score: ${c.conversionScore}/90 (${c.conversionReasoning})`;
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          income: c.income,
          creditScore: c.creditScore,
          idleBalance: c.idleBalance,
          existingEmiRatio: c.existingEmiRatio,
          existingProducts: c.existingProducts,
          demographics: c.demographics,
          lastContactedAt: c.lastContactedAt ? c.lastContactedAt.toISOString() : null,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          conversionScore: c.conversionScore,
          reasoning: reasoningText,
        };
      });
    },
    {
      name: "fetchAndFilter",
      description: "Filters and scores customer list dynamically using Prisma database queries and heuristics.",
      schema: QueryPlanSchema,
    }
  );

  const generateOutreachTool = tool(
    async ({ customers }) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not configured.");

      const model = new ChatGoogleGenerativeAI({
        model: "gemini-3.1-flash-lite",
        apiKey,
        temperature: 0.7,
      });

      const bundles = [];
      for (const customer of customers) {
        const prompt = `You are a helpful banking Relationship Manager. Write a WhatsApp outreach message for our high-value customer.
        
        Customer Details:
        - Name: ${customer.name}
        - Monthly Income: ₹${customer.income.toLocaleString("en-IN")}
        - Existing Products: ${customer.existingProducts.join(", ") || "None"}
        - Credit Score: ${customer.creditScore}
        - Selection Reasoning: ${customer.reasoning}
        
        Requirements:
        1. Under 160 words.
        2. Highly conversational, personal, warm, NOT salesy or generic.
        3. Reference one specific detail about them (e.g. credit score range, monthly account profile).
        4. Propose a relevant financial product recommendations (e.g. personal loan, wealth advisor, mutual funds).
        5. End with a soft, warm call-to-action (CTA).
        
        Generate the WhatsApp message text only.`;

        const response = await model.invoke(prompt);
        const messageText = typeof response.content === "string" ? response.content.trim() : "";

        bundles.push({
          customer,
          productRecommendation: customer.existingProducts.includes("personal_loan") ? "Mutual Funds" : "Personal Loan",
          whatsappMessage: messageText,
        });
      }

      return bundles;
    },
    {
      name: "generateOutreach",
      description: "Generates tailored WhatsApp marketing and outreach copies for lists of customers.",
      schema: z.object({
        customers: z.array(z.any()),
      }),
    }
  );

  return [interpretQueryTool, fetchAndFilterTool, generateOutreachTool];
}

// ── LangGraph Workflow Construction ─────────────────────────────────

// State Definition
export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  queryPlan: Annotation<QueryPlan>({
    reducer: (x, y) => y ?? x,
    default: () => ({
      filters: [],
      limit: 10,
      generateOutreach: false,
    }),
  }),
  customers: Annotation<FilteredCustomer[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  outreachBundles: Annotation<OutreachBundle[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  error: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});

// Node Implementations
async function interpretQueryNode(state: typeof AgentState.State) {
  const tools = createAgentTools();
  const interpretQueryTool = tools[0];

  const lastMessage = state.messages[state.messages.length - 1];
  const queryText = typeof lastMessage.content === "string" ? lastMessage.content : "";

  try {
    const plan = await (interpretQueryTool as any).invoke({ query: queryText }) as QueryPlan;
    return {
      queryPlan: plan,
    };
  } catch (err: any) {
    return {
      error: `Failed to interpret query: ${err.message}`,
    };
  }
}

async function fetchAndFilterNode(state: typeof AgentState.State) {
  if (state.error) return {};
  if (!state.queryPlan) {
    return { error: "No query plan generated" };
  }

  const tools = createAgentTools();
  const fetchAndFilterTool = tools[1];

  try {
    const customers = await (fetchAndFilterTool as any).invoke(state.queryPlan) as FilteredCustomer[];
    return {
      customers,
    };
  } catch (err: any) {
    return {
      error: `Failed to fetch and filter prospects: ${err.message}`,
    };
  }
}

async function generateOutreachNode(state: typeof AgentState.State) {
  if (state.error) return {};
  if (state.customers.length === 0) {
    return { outreachBundles: [] };
  }

  const tools = createAgentTools();
  const generateOutreachTool = tools[2];

  try {
    const outreachBundles = await (generateOutreachTool as any).invoke({
      customers: state.customers,
    }) as OutreachBundle[];
    return {
      outreachBundles,
    };
  } catch (err: any) {
    return {
      error: `Failed to generate outreach copies: ${err.message}`,
    };
  }
}

async function presentResultsNode(state: typeof AgentState.State) {
  if (state.error) {
    return {
      messages: [{
        role: "assistant",
        content: `Error encountered during workflow execution: ${state.error}`,
      }],
    };
  }

  const customerList = state.customers
    .map((c, i) => `${i + 1}. **${c.name}** (Credit Score: ${c.creditScore}, Income: ₹${c.income.toLocaleString("en-IN")}, Balance: ₹${c.idleBalance.toLocaleString("en-IN")})`)
    .join("\n");

  let summaryContent = `Here are the matching prospects (Top ${state.customers.length}):\n\n${customerList || "No customers matched your filter."}\n\n`;

  if (state.queryPlan?.generateOutreach && state.outreachBundles.length > 0) {
    summaryContent += `### Generated WhatsApp Messaging Drafts\n\n`;
    state.outreachBundles.forEach((bundle) => {
      summaryContent += `**To: ${bundle.customer.name}** (Recommendation: *${bundle.productRecommendation}*)\n`;
      summaryContent += `> ${bundle.whatsappMessage.split("\n").join("\n> ")}\n\n`;
    });
  }

  const assistantMessage = {
    role: "assistant",
    content: summaryContent,
  };

  return {
    messages: [assistantMessage],
  };
}

// Router
function shouldGenerateOutreach(state: typeof AgentState.State) {
  if (state.error) {
    return "present_results";
  }
  if (state.queryPlan?.generateOutreach) {
    return "generate_outreach";
  }
  return "present_results";
}

// Workflow Compiler
export function createAgentWorkflow() {
  const checkpointer = new PrismaCheckpointer();

  const workflow = new StateGraph(AgentState)
    .addNode("interpret_query", interpretQueryNode)
    .addNode("fetch_and_filter", fetchAndFilterNode)
    .addNode("generate_outreach", generateOutreachNode)
    .addNode("present_results", presentResultsNode)
    .addEdge("__start__", "interpret_query")
    .addEdge("interpret_query", "fetch_and_filter")
    .addConditionalEdges("fetch_and_filter", shouldGenerateOutreach, {
      generate_outreach: "generate_outreach",
      present_results: "present_results",
    })
    .addEdge("generate_outreach", "present_results")
    .addEdge("present_results", "__end__");

  return workflow.compile({
    checkpointer,
  });
}
