import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Server DB is *only* for Better Auth local sessions (vault-derived).
// Product records (vault envelope, connections, agent state, adapters) live in
// browser-owned storage. The server DB is only for Better Auth/session tables.
const databaseUrl = (process.env.DATABASE_URL ?? "file:./dev.db").trim();

const adapter = new PrismaLibSql({ url: databaseUrl });

const prisma = new PrismaClient({ adapter });

export { prisma };
export default prisma;
