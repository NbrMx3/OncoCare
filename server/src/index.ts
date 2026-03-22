import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { checkDbConnection } from "./db";
import { prisma } from "./prisma";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 5000;
const jwtSecret = process.env.JWT_SECRET || "change_me_in_production";

type AuthenticatedRequest = Request & {
	userId?: string;
};

const authenticateToken = (
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction,
) => {
	const authHeader = req.headers.authorization;
	const token = authHeader?.startsWith("Bearer ")
		? authHeader.slice(7)
		: undefined;

	if (!token) {
		return res.status(401).json({ message: "missing auth token" });
	}

	try {
		const payload = jwt.verify(token, jwtSecret) as { userId: string };
		req.userId = payload.userId;
		next();
	} catch {
		return res.status(401).json({ message: "invalid auth token" });
	}
};

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
	res.status(200).json({ ok: true, service: "server" });
});

app.get("/health/db", async (_req: Request, res: Response) => {
	try {
		await checkDbConnection();
		res.status(200).json({ ok: true, database: "connected" });
	} catch (error) {
		console.error("Database health check failed:", error);
		res.status(500).json({ ok: false, database: "disconnected" });
	}
});

app.post("/api/register", async (req: Request, res: Response) => {
	try {
		const { email, password } = req.body as {
			email?: string;
			password?: string;
		};

		if (!email || !password) {
			return res.status(400).json({ message: "email and password are required" });
		}

		const existingUser = await prisma.user.findUnique({ where: { email } });
		if (existingUser) {
			return res.status(409).json({ message: "email already registered" });
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: {
				email,
				password: hashedPassword,
			},
		});

		const token = jwt.sign({ userId: user.id }, jwtSecret, {
			expiresIn: "7d",
		});

		return res.status(201).json({ token, user: { id: user.id, email: user.email } });
	} catch (error) {
		console.error("Register failed:", error);
		return res.status(500).json({ message: "register failed" });
	}
});

app.post("/api/login", async (req: Request, res: Response) => {
	try {
		const { email, password } = req.body as {
			email?: string;
			password?: string;
		};

		if (!email || !password) {
			return res.status(400).json({ message: "email and password are required" });
		}

		const user = await prisma.user.findUnique({ where: { email } });
		if (!user || !user.password) {
			return res.status(401).json({ message: "invalid credentials" });
		}

		const isValidPassword = await bcrypt.compare(password, user.password);
		if (!isValidPassword) {
			return res.status(401).json({ message: "invalid credentials" });
		}

		const token = jwt.sign({ userId: user.id }, jwtSecret, {
			expiresIn: "7d",
		});

		return res.status(200).json({ token, user: { id: user.id, email: user.email } });
	} catch (error) {
		console.error("Login failed:", error);
		return res.status(500).json({ message: "login failed" });
	}
});

app.post(
	"/api/patients",
	authenticateToken,
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			const { name, symptoms, riskLevel } = req.body as {
				name?: string;
				symptoms?: string;
				riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
			};

			if (!req.userId) {
				return res.status(401).json({ message: "unauthorized" });
			}

			if (!name || !symptoms || !riskLevel) {
				return res.status(400).json({
					message: "name, symptoms and riskLevel are required",
				});
			}

			const patient = await prisma.patient.create({
				data: {
					name,
					symptoms,
					riskLevel,
					userId: req.userId,
				},
			});

			return res.status(201).json(patient);
		} catch (error) {
			console.error("Create patient failed:", error);
			return res.status(500).json({ message: "create patient failed" });
		}
	},
);

app.get(
	"/api/patients",
	authenticateToken,
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			if (!req.userId) {
				return res.status(401).json({ message: "unauthorized" });
			}

			const patients = await prisma.patient.findMany({
				where: { userId: req.userId },
				orderBy: { createdAt: "desc" },
			});

			return res.status(200).json(patients);
		} catch (error) {
			console.error("Fetch patients failed:", error);
			return res.status(500).json({ message: "fetch patients failed" });
		}
	},
);

app.get(
	"/api/alerts",
	authenticateToken,
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			if (!req.userId) {
				return res.status(401).json({ message: "unauthorized" });
			}

			const alerts = await prisma.patient.findMany({
				where: {
					userId: req.userId,
					riskLevel: { in: ["HIGH", "CRITICAL"] },
				},
				orderBy: { createdAt: "desc" },
			});

			return res.status(200).json(alerts);
		} catch (error) {
			console.error("Fetch alerts failed:", error);
			return res.status(500).json({ message: "fetch alerts failed" });
		}
	},
);

app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
});
