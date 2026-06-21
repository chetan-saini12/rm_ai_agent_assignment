# RM AI Agent — Banking CRM Relationship Manager Assistant

An Agentic AI application designed for banking Relationship Managers (RMs) to query customer data, identify conversion-ready prospects using deterministic rules, and draft context-specific WhatsApp outreach templates. Built on Next.js, LangGraph, Prisma, PostgreSQL, and Google Gemini.

---

## ● Architecture Diagram

The application isolates conversational reasoning (identifying intent and drafting messages) from execution (retrieving and scoring customers). Below is the system architecture showing the flow of request execution and data persistence:

```mermaid
graph TD
    UI[Relationship Manager / UI] -->|1. Submit Prompt| API[Next.js API Route: /api/agent]
    API -->|2. Stream Real-Time Node SSE Events| UI
    API -->|3. Compile Workflow with thread_id| Graph[LangGraph StateGraph]
    Graph -->|Persists state & execution logs| DB[(PostgreSQL Database)]
    
    subgraph LangGraph Execution Flow
        Graph --> Node1[interpret_query Node]
        Node1 -->|interpretQuery Tool| LLM1[Gemini 3.1 Flash Lite]
        LLM1 -->|Returns Structured QueryPlan JSON| Node1
        
        Node1 -->|Updates queryPlan state| Node2[fetch_and_filter Node]
        Node2 -->|fetchAndFilter Tool| Heuristic[Deterministic Heuristic Scoring]
        Node2 -->|Queries prospects & transactions| DB
        
        Node2 -->|Updates customers list| Router{Router: generateOutreach?}
        Router -->|Yes| Node3[generate_outreach Node]
        Router -->|No| Node4[present_results Node]
        
        Node3 -->|generateOutreach Tool| LLM2[Gemini 3.1 Flash Lite]
        LLM2 -->|Generates messaging copies| Node3
        Node3 -->|Updates outreachBundles state| Node4
        
        Node4 -->|Formats markdown response| End[__end__]
    end
    
    subgraph Data & Persistence Layer
        DB --- PrismaClient[Prisma ORM Client]
        PrismaClient --- Checkpointer[PrismaCheckpointer]
        Checkpointer -->|Stores state updates| CheckpointTable[checkpoints & checkpoint_writes tables]
    end
```

### ASCII Architecture Representation
```
[ Relationship Manager UI ]
           │  ▲
 1. Prompt │  │ 2. SSE Streams (Real-Time Nodes & Logs)
           ▼  │
   [ /api/agent Endpoint ]
           │
           ▼ (Compiles with Thread ID Checkpointer)
   [ LangGraph Workflow ]
     ├── Node 1: interpret_query   ──► [ Gemini 3.1 Flash Lite ] (Structured QueryPlan JSON)
     ├── Node 2: fetch_and_filter  ──► [ Prisma Client ] (DB Fetch & Dynamic JS Filter)
     │                                     └─► [ Scoring Heuristics ] (Rule-Based Calculations)
     ├── Node 3: generate_outreach ──► [ Gemini 3.1 Flash Lite ] (WhatsApp Copies, Optional)
     └── Node 4: present_results   ──► Compile final response & Close SSE Connection
```

---

## ● Execution Flow

The RM Agent follows a deterministic workflow to process request sequences:

1. **User Query Input**: The Relationship Manager inputs a conversational query (e.g., *"Find high income prospects in Bangalore with credit score > 700 without personal loans and write WhatsApp templates"*).
2. **REST request and SSE Stream Initialization**: The React client POSTs the query and a unique `threadId` to `/api/agent`. The server responds with `Content-Type: text/event-stream` to establish a persistent connection.
3. **Workflow Compilation & State Restoration**: The API handler instantiates the LangGraph StateGraph compiled with a custom `PrismaCheckpointer`. The checkpointer queries the database to load any existing thread history.
4. **Node 1: Interpret Query (`interpret_query`)**: 
   - Invokes the `interpretQuery` tool.
   - The LLM parses natural language and outputs a strictly typed `QueryPlan` schema (Zod validated).
5. **Node 2: Fetch and Filter (`fetch_and_filter`)**:
   - Queries the database for customer entries and transaction logs.
   - Filters are applied dynamically in JavaScript based on the output `QueryPlan` instructions.
   - Evaluates a deterministic **Conversion Score** and appends explainable reasoning to each matched customer.
6. **Conditional Routing**:
   - The router inspects `state.queryPlan.generateOutreach`. If true, the flow transitions to `generate_outreach`; otherwise, it routes directly to `present_results`.
7. **Node 3: Generate Outreach (`generate_outreach`)**:
   - Loops over the top-ranked prospects.
   - Invokes the `generateOutreach` tool, which uses Gemini with tailored instructions to generate conversational WhatsApp templates matching the client's financial profile.
8. **Node 4: Present Results (`present_results`)**:
   - Constructs the final markdown presentation containing ranked prospects, explainability summaries, and message drafts. Pushes a final payload down the SSE connection and flags the stream as completed.

---

## ● Tool Design and Usage

The agent implements three core, decoupled tools that are fully testable in isolation:

| Tool Name | Input Parameters | Output Type | Primary Role |
| :--- | :--- | :--- | :--- |
| `interpretQuery` | `query: string` | `QueryPlan` (JSON) | Translates unstructured prompt strings into a structured plan consisting of database filters, sort directives, result limits, and outreach flags. |
| `fetchAndFilter` | `QueryPlan` (JSON) | `FilteredCustomer[]` | Reads the database, filters records programmatically, runs the scoring heuristic, ranks prospects, and returns the list. |
| `generateOutreach` | `customers: FilteredCustomer[]` | `OutreachBundle[]` | Takes matched prospects and calls the LLM to generate highly targeted WhatsApp messaging drafts and product recommendations. |

### Deterministic Conversion Scoring Heuristic
Instead of asking an LLM to score customers, the application uses an auditable, rule-based scoring mechanism:

- **Income Bonus**: Monthly income > ₹50,000 (`+20`)
- **Credit Score Bonus**: Credit score > 750 (`+25`)
- **New Product Target**: No existing personal loan holding (`+20`)
- **Active Earnings Signal**: Verifiable salary credit in transactions (`+15`)
- **Account Health**: Idle account balance > ₹100,000 (`+10`)
- **EMI Debt Burden**: Existing EMI-to-income ratio > 50% (`-20`)
- **Contact Fatigue Prevention**: Contacted by an RM in the last 30 days (`-10`)
- **Total Possible Range**: `-30` to `+90`

---

## ● Key Design Decisions

1. **Structured LLM Planning, Deterministic Data Actions**:
   The LLM is kept out of database query execution. It only designs the `QueryPlan` JSON. The actual data loading and filtering are executed by code. This eliminates SQL injection risks and LLM hallucinations of invalid database entries.
2. **Deterministic Score + LLM Reasoning Hybrid**:
   Prospect scoring relies on a hardcoded, explainable algorithm. We use the LLM to write the natural language messaging copies based on those scores and fields. This provides RMs with absolute clarity on *why* a customer was ranked high.
3. **Custom Prisma Checkpointer**:
   Instead of using standard in-memory memory blocks (which fail on server restarts) or external systems like Redis, we built a database-backed `PrismaCheckpointer`. It serializes and saves LangGraph execution checkpoints directly to the database.
4. **Real-time SSE Dashboard**:
   Instead of waiting for a single long HTTP block, the backend streams the execution of each node in real-time. The UI renders the active node (e.g., "1. Interpret Query" -> "2. Fetch & Filter") and allows the user to inspect intermediate payloads (like the parsed QueryPlan) immediately.

---

## ● Trade-offs and Limitations

- **In-Memory Filtering at Scale**:
  Currently, `fetchAndFilter` retrieves all database entries using Prisma and filters them in memory. While highly flexible and fast for a few thousand items, it will cause high memory usage on tables with millions of customers.
  *Mitigation: Refactor filters into native SQL `WHERE` queries inside Prisma.*
- **Sequential API Outreach Calls**:
  Outreach generation processes customers sequentially in a loop, making a blocking Gemini API call for each customer. For long list queries (e.g., limit of 20+), this can lead to high request latency.
  *Mitigation: Refactor to parallelize the requests using `Promise.all` or delegate templates to background queues.*
- **Local Database Dependency**:
  Requires an active PostgreSQL database. It is not easily run in an offline/static hosting environment unless converted to SQLite.

---

## ● Setup and Run Instructions

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **Database**: PostgreSQL instance (local or hosted)
- **API Key**: Google Gemini API Key

### 2. Environment Configuration
Create a `.env` file in the root directory:
```bash
cp .env.sample .env
```
Open `.env` and fill in the values:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/rm_agent_db?schema=public"
GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup & Seeding
Deploy database tables and schemas using Prisma:
```bash
# Run migrations
npx prisma migrate dev --name init

# Seed customer data (creates 70 mock prospects with transaction histories)
npx prisma db seed
```

### 5. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your browser. Click the **"Talk to Agent"** button in the upper right to open the conversational dashboard and test your prompts.
