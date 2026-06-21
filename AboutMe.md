# Agentic AI System Design
### Framework & Planning Guide — Banking CRM · LangGraph + Next.js

---

## The Mental Model First

Before touching code, answer one question:

> **What decisions does the agent need to make, and what data does it need to make them?**

Everything else flows from that. For this banking Agent, extract three things:

| | |
|---|---|
| **Who is the user?** | Relationship Manager — not a customer, not an engineer |
| **What is their job?** | Identify prospects + reach out |
| **What do they do manually?** | Filter CRM, guess who's likely to convert, write messages |

This tells you the agent's job is to **automate the RM's cognitive workflow** — not just query a database.

---

## Phase 1 — Understand the Domain

Read the problem and extract three things before writing a single line of code.

| Extract This | For This Agent |
|---|---|
| Who is the user? | Relationship Manager — someone with domain expertise, not an engineer |
| What is their job? | Identify high-value prospects and generate personalized outreach |
| What do they do manually today? | Filter CRM spreadsheets, write individual messages, guess conversion likelihood |

---

## Phase 2 — Decompose into Sub-Problems

Take the user's ask and break it into **atomic steps a human would follow**. Each step becomes a tool or node in your agent graph.

> **Rule:** If a step requires different data or different logic than the previous step, it is a separate node.

**Decomposition for the banking Agent:**

```
"Find high-value customers likely to convert for personal loan"
        ↓
1. Interpret the query     →  what is the RM actually asking for?
2. Fetch and filter        →  apply those criteria dynamically
3. Rank and select         →  top N candidates
4. Generate outreach       →  personalized per customer
5. Present results         →  structured output back to RM
```

---

## Phase 3 — Design the Data Model

Ask: what does each node need as input, and what does it produce as output? Design this **before** writing any agent code.

> **Key Principle:** State shape = the contract between nodes. Get this right and everything else is easier.

### CustomerData `(raw input)`

```ts
CustomerData {
  id, name, income, credit_score,
  existing_products[],
  transaction_history[],
  last_contacted_at,
  demographics
}
```

### QueryPlan `(output of interpret_query node)`

The LLM's job is not to fetch data — it is to extract the RM's intent into a structured schema.

```ts
QueryPlan {
  filters: [
    { field: "credit_score", operator: "gte", value: 800 },
    { field: "existing_products", operator: "not_includes", value: "personal_loan" }
  ],
  sort_by: { field: "credit_score", direction: "desc" },
  limit: 10,
  generate_outreach: boolean   // did RM ask for messages or just a list?
}
```

### FilteredCustomer `(output of fetch_and_filter node)`

```ts
FilteredCustomer extends CustomerData {
  reasoning: string    // why this customer matched the query
}
```

### OutreachBundle `(final output, if requested)`

```ts
OutreachBundle {
  customer: FilteredCustomer
  product_recommendation: string
  whatsapp_message: string
}
```

---

## Phase 4 — Design the Agent Architecture

For LangGraph, think in terms of: `StateGraph → nodes → edges → conditional routing`

### Why the old architecture breaks

A hardcoded scoring tool only works if the RM always asks the same thing:

```ts
// ❌ This breaks the moment the RM asks anything outside this shape
scoreConversionLikelihood({ customer: CustomerData })
```

The RM might ask:
- *"Give me customers with credit score above 800"*
- *"Find customers not contacted in 60 days"*
- *"Show high income customers who have FD but no mutual fund"*

A fixed tool cannot handle dynamic, unpredictable queries.

### The correct architecture

```
[START]
   ↓
[interpret_query]        →  LLM converts RM's natural language
                             into a structured QueryPlan JSON
   ↓
[fetch_and_filter]       →  applies QueryPlan filters dynamically
                             to the customer DB — any field, any operator
   ↓
[conditional edge]       →  queryPlan.generate_outreach?
       YES ↓                              NO ↓
[generate_outreach]                [present_results]
       ↓
[present_results]
   ↓
[HITL loop]              →  RM can approve / edit / regenerate
```

> **Architecture Decision:** The `interpret_query` node is what makes the system flexible. The LLM's only job there is to produce a `QueryPlan` JSON — it does not touch the data. Separation of reasoning and execution is the key design principle here.

---

## Phase 5 — Tool Design

Three tools, fully composable, handle any question the RM can ask.

| Tool | Input | Output |
|---|---|---|
| `interpretQuery` | RM's natural language string | `QueryPlan` |
| `fetchAndFilter` | `QueryPlan` | `FilteredCustomer[]` |
| `generateOutreach` | `FilteredCustomer[]` + context | `OutreachBundle[]` |

Each tool follows three principles:

| Principle | What It Means |
|---|---|
| Single responsibility | Does one thing only — interpret, fetch, or generate |
| Typed input/output | LangChain `StructuredTool` with Zod schema |
| Independently testable | Call it in isolation before wiring into the graph |

### `fetchAndFilter` — handles any field dynamically

```ts
function fetchAndFilter(queryPlan: QueryPlan, customers: CustomerData[]) {
  let results = customers

  for (const f of queryPlan.filters) {
    results = results.filter(c => applyOperator(c[f.field], f.operator, f.value))
  }

  results = results.sort((a, b) => {
    const dir = queryPlan.sort_by.direction === 'desc' ? -1 : 1
    return (a[queryPlan.sort_by.field] - b[queryPlan.sort_by.field]) * dir
  })

  return results.slice(0, queryPlan.limit)
}
```

Now any field the RM mentions — `credit_score`, `income`, `last_contacted_at`, `idle_balance` — just works without changing any tool code.

---

## Phase 6 — Mock First, Real Later

For take-home Agents, your data layer should start with static files. This lets you iterate on agent logic without needing a real DB, and evaluators can run it without any setup.

```
/data/customers.json      ←  20–30 mock customers with realistic fields
/data/transactions.json   ←  3 months of mock transactions per customer
```

> **Tip:** Write tools that read from these files. Your tool interface stays identical when you swap in a real database later — only the implementation changes.

---

## Phase 7 — The Scoring Logic *(Where You Differentiate)*

Most candidates will just call an LLM and say "score this customer." **Don't.**

When the RM asks for conversion likelihood specifically, the `interpretQuery` node should produce a `QueryPlan` that includes a scoring pass. That scoring uses explicit heuristics — not a vague LLM call.

```ts
function scoreConversion(customer: CustomerData): number {
  let score = 0

  // Positive signals
  if (customer.income > 50000)                       score += 20
  if (customer.credit_score > 750)                   score += 25
  if (!customer.products.includes('personal_loan'))  score += 20
  if (recentSalaryCredit(customer.transactions))     score += 15
  if (customer.idle_balance > 100000)                score += 10

  // Negative signals
  if (customer.existing_emi_ratio > 0.5)             score -= 20
  if (customer.last_contacted_at < 30_days_ago)      score -= 10

  return score  // max: 90
}
```

> **Key Insight:** Rules + LLM beats LLM alone for reliability and explainability. Heuristics produce a deterministic score; the LLM then adds reasoning on top for edge cases.

The scoring function is **not a tool** — it is a utility called inside `fetchAndFilter` when the `QueryPlan` includes `sort_by: { field: "conversion_score" }`.

---

## Phase 8 — Outreach Generation

Only runs when `queryPlan.generate_outreach === true`. Message quality depends entirely on how well you construct the prompt — use specific customer context, not a generic template.

```
System:
  You are a banking RM assistant. Write WhatsApp messages that are:
  - Under 160 words
  - Conversational, not salesy
  - Reference one specific fact about the customer
  - End with a soft CTA

User:
  Customer: Rajesh Sharma
  Income: ₹85,000/month
  Has: Savings account, FD
  Doesn't have: Personal loan
  Recent activity: Salary credited, booked a flight
  Conversion score: 78/90
  Reason: High income, no existing loan, recent large spend suggests upcoming need
```

---

## Phase 9 — Next.js Integration

The agent runs server-side. Expose it through three endpoints and stream progress to the UI.

| Endpoint | Purpose |
|---|---|
| `POST /api/agent/run` | Accepts RM's natural language query, starts graph, returns job ID |
| `GET /api/agent/status/[id]` | SSE stream of node-by-node progress |
| `POST /api/agent/approve` | HITL: RM approves, edits, or rejects recommendations |

**UI should include:**

- Chat interface where RM types the natural language request
- Real-time progress panel as nodes execute (streamed via SSE)
- Results panel with customer cards + generated messages
- Edit / Approve / Regenerate buttons per message

---

## Differentiation Checklist

Things that separate a good submission from a great one:

- [ ] **Dynamic querying** — RM can ask about any field, the agent handles it via `QueryPlan`
- [ ] **Explainability** — show *why* each customer was selected, not just that they were
- [ ] **Conditional outreach** — message generation only runs when the RM asks for it
- [ ] **HITL** — let the RM say "regenerate this message" or "exclude this customer"
- [ ] **Streaming** — show node-by-node progress in the UI, not just a final result
- [ ] **Typed state** — your LangGraph state has a clear TypeScript interface
- [ ] **Error handling** — if filtering fails for one customer, don't crash the whole run
- [ ] **Modular tools** — evaluator can swap mock DB for real one without touching agent code

---

## Universal Framework — Applies to Any Agentic Problem

Use these questions as your starting checklist for any future Agent or company task:

| Question to Answer | What It Defines |
|---|---|
| Who is the user and what's their workflow? | Agent persona and scope |
| What are the atomic decision steps? | Graph nodes |
| What data flows between steps? | State shape / type contracts |
| Is any node hardcoded to one query shape? | If yes, add an interpret node before it |
| What can fail and how? | Error boundaries and fallbacks |
| Where does a human need to stay in control? | HITL interrupt points |
| What's the minimal mock data to show the full flow? | Your development strategy |

> **Remember:** The code is the easy part once you've answered these questions. Architecture decisions made before writing code save 10x the time compared to refactoring later.