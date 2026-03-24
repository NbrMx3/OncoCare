import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const databaseUrl =
	process.env.DATABASE_URL ||
	process.env.POSTGRES_URL ||
	process.env.POSTGRESQL_URL;

if (!databaseUrl) {
	throw new Error(
		"DATABASE_URL is required. Set it in server/.env for local dev or as an environment variable in Render.",
	);
}

const adapter = new PrismaPg({ connectionString: databaseUrl });

export const prisma = new PrismaClient({ adapter });
