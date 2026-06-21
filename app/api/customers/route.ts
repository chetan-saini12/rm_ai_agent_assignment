import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// ── GET /api/customers?search=&page=&limit= ─────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    return Response.json({
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return Response.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}

// ── POST /api/customers ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, email, phone, income, creditScore, idleBalance, existingEmiRatio, existingProducts, demographics, lastContactedAt } = body;

    // Basic validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }
    if (income == null || isNaN(Number(income)) || Number(income) < 0) {
      return Response.json({ error: "Valid income is required" }, { status: 400 });
    }
    if (creditScore == null || isNaN(Number(creditScore)) || Number(creditScore) < 300 || Number(creditScore) > 900) {
      return Response.json({ error: "Credit score must be between 300 and 900" }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        income: Number(income),
        creditScore: Number(creditScore),
        idleBalance: Number(idleBalance) || 0,
        existingEmiRatio: Number(existingEmiRatio) || 0,
        existingProducts: existingProducts || [],
        demographics: demographics || {},
        lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null,
      },
    });

    return Response.json({ customer }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/customers error:", error);

    // Handle Prisma unique constraint violations
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return Response.json(
        { error: "A customer with that email or phone already exists" },
        { status: 409 }
      );
    }

    return Response.json(
      { error: "Failed to create customer" },
      { status: 500 }
    );
  }
}
