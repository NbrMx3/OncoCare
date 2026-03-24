import { Pool } from "pg";
import dotenv from "dotenv";
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

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const checkDbConnection = async (): Promise<void> => {
  await pool.query("SELECT 1");
};
