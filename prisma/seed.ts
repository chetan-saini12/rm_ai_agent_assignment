
import { prisma } from "../lib/prisma"

const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Dhruv', 'Krishna',
    'Priya', 'Ananya', 'Pooja', 'Sneha', 'Deepa', 'Kavya', 'Meera', 'Riya', 'Shreya', 'Nisha',
    'Rohit', 'Amit', 'Suresh', 'Rajesh', 'Vikram', 'Nikhil', 'Karan', 'Rahul', 'Manish', 'Ankur'];

const lastNames = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Shah', 'Mehta', 'Joshi', 'Nair',
    'Reddy', 'Rao', 'Iyer', 'Pillai', 'Menon', 'Chatterjee', 'Banerjee', 'Das', 'Bose', 'Kapoor'];

const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow'];

const occupations = ['Software Engineer', 'Doctor', 'Business Owner', 'Teacher', 'CA', 'Lawyer', 'Manager', 'Consultant', 'Architect', 'Government Employee'];

const allProducts = ['savings_account', 'fd', 'mutual_fund', 'personal_loan', 'home_loan', 'credit_card', 'rd', 'insurance', 'demat_account', 'car_loan'];

const txnTypes = ['salary_credit', 'purchase', 'emi', 'transfer', 'fd_interest', 'atm_withdrawal', 'upi_payment', 'loan_repayment'];

const txnDescriptions: Record<string, string[]> = {
    salary_credit: ['Monthly salary', 'Salary credit', 'Employer salary transfer'],
    purchase: ['Amazon purchase', 'Grocery shopping', 'Flipkart order', 'Restaurant bill', 'Fuel'],
    emi: ['Home loan EMI', 'Car loan EMI', 'Personal loan EMI'],
    transfer: ['NEFT transfer', 'IMPS transfer', 'Family transfer'],
    fd_interest: ['FD interest credit', 'Fixed deposit maturity'],
    atm_withdrawal: ['ATM cash withdrawal', 'Cash withdrawal'],
    upi_payment: ['UPI payment', 'Google Pay', 'PhonePe transfer'],
    loan_repayment: ['Loan prepayment', 'Loan EMI clearance'],
};

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const pickMultiple = <T>(arr: T[], min: number, max: number): T[] => {
    const count = randInt(min, max);
    return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
};

function generateCustomer(index: number) {
    const firstName = pick(firstNames);
    const lastName = pick(lastNames);
    const name = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@example.com`;
    const phone = `+91${randInt(7000000000, 9999999999)}`;

    const income = Math.round(rand(25000, 500000) / 1000) * 1000;
    const creditScore = randInt(550, 850);
    const idleBalance = Math.round(rand(5000, 2000000) / 1000) * 1000;
    const existingEmiRatio = parseFloat(rand(0, 0.65).toFixed(2));
    const existingProducts = pickMultiple(allProducts, 1, 5);

    const demographics = {
        age: randInt(22, 62),
        gender: Math.random() > 0.5 ? 'Male' : 'Female',
        city: pick(cities),
        occupation: pick(occupations),
    };

    const lastContactedAt = Math.random() > 0.3
        ? new Date(Date.now() - randInt(1, 180) * 24 * 60 * 60 * 1000)
        : null;

    return { name, email, phone, income, creditScore, idleBalance, existingEmiRatio, existingProducts, demographics, lastContactedAt };
}

function generateTransactions(customerId: string, income: number, count: number) {
    const txns = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        const type = pick(txnTypes);
        const date = new Date(now - randInt(0, 180) * 24 * 60 * 60 * 1000);

        let amount: number;
        if (type === 'salary_credit') amount = income + rand(-5000, 5000);
        else if (type === 'emi') amount = income * rand(0.05, 0.3);
        else if (type === 'fd_interest') amount = rand(1000, 20000);
        else if (type === 'atm_withdrawal') amount = rand(1000, 20000);
        else amount = rand(200, 50000);

        txns.push({
            customerId,
            type,
            amount: Math.round(amount),
            date,
            description: pick(txnDescriptions[type]),
        });
    }

    return txns;
}

async function main() {
    console.log('🌱 Seeding database...');

    await prisma.transaction.deleteMany();
    await prisma.customer.deleteMany();
    console.log('🗑️  Cleared existing data');

    for (let i = 1; i <= 70; i++) {
        const data = generateCustomer(i);
        const customer = await prisma.customer.create({ data });

        const txnCount = randInt(8, 25);
        const transactions = generateTransactions(customer.id, customer.income, txnCount);
        await prisma.transaction.createMany({ data: transactions });

        console.log(`✅ [${i}/70] ${customer.name} — ${transactions.length} transactions`);
    }

    console.log('\n🎉 Seed complete — 70 customers inserted.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());