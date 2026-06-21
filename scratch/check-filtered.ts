import "dotenv/config";
import { prisma } from "../lib/prisma";

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

async function main() {
  const dbCustomers = await prisma.customer.findMany({
    include: {
      transactions: true,
    },
  });

  const scored = dbCustomers.map(c => {
    const { score } = scoreConversion(c);
    return { ...c, conversionScore: score };
  });

  // Sort by conversionScore desc
  scored.sort((a, b) => b.conversionScore - a.conversionScore);

  console.log("Top 15 customers in DB overall (no filter):");
  scored.slice(0, 15).forEach((c, idx) => {
    console.log(`${idx + 1}. Name: ${c.name}, Credit Score: ${c.creditScore}, Income: ${c.income}, Balance: ${c.idleBalance}, Score: ${c.conversionScore}`);
  });
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
