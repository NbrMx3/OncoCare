import dotenv from "dotenv";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Request, Response } from "express";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../prisma";
import {
	AuthenticatedRequest,
	authenticateToken,
	signToken,
} from "../../common/auth";
import { createModuleApp } from "../../common/app";
import { resolveModulePort } from "../../common/ports";

dotenv.config();

const app = createModuleApp("auth");
const port = resolveModulePort("AUTH_PORT", 5101);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL =
	process.env.GOOGLE_CALLBACK_URL || "http://localhost:5101/api/auth/google/callback";

const isMissingProfessionColumnError = (error: unknown): boolean => {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
		return false;
	}

	if (error.code !== "P2022") {
		return false;
	}

	const missingColumn = String(error.meta?.column ?? "").toLowerCase();
	return missingColumn.includes("profession");
};

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
	passport.use(
		new GoogleStrategy(
			{
				clientID: GOOGLE_CLIENT_ID,
				clientSecret: GOOGLE_CLIENT_SECRET,
				callbackURL: GOOGLE_CALLBACK_URL,
			},
			(_accessToken, _refreshToken, profile, done) => {
				return done(null, {
					email: profile.emails?.[0]?.value,
					name: profile.displayName,
				});
			},
		),
	);
}

app.use(passport.initialize());

app.post("/api/auth/register", async (req: Request, res: Response) => {
	try {
		const { name, email, password, role, profession } = req.body as {
			name?: string;
			email?: string;
			password?: string;
			role?: Role;
			profession?: string;
		};

		if (!name || !email || !password) {
			return res
				.status(400)
				.json({ message: "name, email and password are required" });
		}

		const userRole = role ?? Role.PATIENT;
		const normalizedProfession = profession?.trim() || null;
		if (userRole === Role.DOCTOR && !normalizedProfession) {
			return res.status(400).json({ message: "profession is required for doctors" });
		}
		const exists = await prisma.user.findUnique({ where: { email } });
		if (exists) {
			return res.status(409).json({ message: "email already exists" });
		}

		const hashed = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: {
				name,
				email,
				password: hashed,
				role: userRole,
				provider: "local",
				profession: userRole === Role.DOCTOR ? normalizedProfession : null,
			},
		});

		const token = signToken(user);
		return res.status(201).json({
			token,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				profession: userRole === Role.DOCTOR ? normalizedProfession : null,
			},
		});
	} catch (error) {
		console.error("Auth register failed:", error);
		return res.status(500).json({ message: "register failed" });
	}
});

app.post("/api/auth/login", async (req: Request, res: Response) => {
	try {
		const { email, password } = req.body as {
			email?: string;
			password?: string;
		};

		if (!email || !password) {
			return res.status(400).json({ message: "email and password are required" });
		}

		const user = await prisma.user.findUnique({
			where: { email },
			select: {
				id: true,
				email: true,
				name: true,
				password: true,
				role: true,
				provider: true,
				profession: true,
			},
		}).catch(async (error) => {
			if (!isMissingProfessionColumnError(error)) {
				throw error;
			}

			const legacyUser = await prisma.user.findUnique({
				where: { email },
				select: {
					id: true,
					email: true,
					name: true,
					password: true,
					role: true,
					provider: true,
				},
			});

			if (!legacyUser) {
				return null;
			}

			return {
				...legacyUser,
				profession: null,
			};
		});
		if (!user || !user.password) {
			return res.status(401).json({ message: "invalid credentials" });
		}

		const match = await bcrypt.compare(password, user.password);
		if (!match) {
			return res.status(401).json({ message: "invalid credentials" });
		}

		const token = signToken({ id: user.id, role: user.role });
		return res.status(200).json({
			token,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				provider: user.provider,
				profession: user.profession,
			},
		});
	} catch (error) {
		console.error("Auth login failed:", error);
		return res.status(500).json({ message: "login failed" });
	}
});

app.get(
	"/api/auth/google",
	(req: Request, res: Response, next) => {
		if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
			return res.status(500).json({ message: "google oauth not configured" });
		}
		next();
	},
	passport.authenticate("google", { scope: ["profile", "email"], session: false }),
);

app.get(
	"/api/auth/google/callback",
	(req: Request, res: Response, next) => {
		if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
			return res.status(500).json({ message: "google oauth not configured" });
		}
		next();
	},
	passport.authenticate("google", { session: false, failureRedirect: "/auth/failed" }),
	async (req: Request, res: Response) => {
		try {
			const profile = req.user as { email?: string; name?: string };
			if (!profile.email || !profile.name) {
				return res.status(400).json({ message: "invalid google profile" });
			}

			const user = await prisma.user.upsert({
				where: { email: profile.email },
				create: {
					name: profile.name,
					email: profile.email,
					role: Role.PATIENT,
					provider: "google",
					profession: null,
				},
				update: {
					name: profile.name,
					provider: "google",
				},
			});

			const token = signToken(user);
			return res.status(200).json({
				token,
				user: { id: user.id, name: user.name, email: user.email, role: user.role },
			});
		} catch (error) {
			console.error("Google callback failed:", error);
			return res.status(500).json({ message: "google oauth failed" });
		}
	},
);

app.get(
	"/api/auth/me",
	authenticateToken,
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			if (!req.userId) {
				return res.status(401).json({ message: "unauthorized" });
			}

			const userId = req.userId;

			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: { id: true, email: true, name: true, role: true, provider: true, profession: true },
			}).catch(async (error) => {
				if (!isMissingProfessionColumnError(error)) {
					throw error;
				}

				const legacyUser = await prisma.user.findUnique({
					where: { id: userId },
					select: { id: true, email: true, name: true, role: true, provider: true },
				});

				if (!legacyUser) {
					return null;
				}

				return {
					...legacyUser,
					profession: null,
				};
			});

			if (!user) {
				return res.status(404).json({ message: "user not found" });
			}

			return res.status(200).json({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				provider: user.provider,
				profession: user.profession,
			});
		} catch (error) {
			console.error("Auth me failed:", error);
			return res.status(500).json({ message: "fetch profile failed" });
		}
	},
);

app.put(
	"/api/auth/me",
	authenticateToken,
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			if (!req.userId) {
				return res.status(401).json({ message: "unauthorized" });
			}

			const { name, profession } = req.body as {
				name?: string;
				profession?: string | null;
			};

			const updates: {
				name?: string;
				profession?: string | null;
			} = {};

			if (typeof name === "string" && name.trim()) {
				updates.name = name.trim();
			}

			if (profession !== undefined) {
				updates.profession = profession?.trim() ? profession.trim() : null;
			}

			if (Object.keys(updates).length === 0) {
				return res.status(400).json({ message: "no profile updates provided" });
			}

			const user = await prisma.user.update({
				where: { id: req.userId },
				data: updates,
				select: {
					id: true,
					name: true,
					email: true,
					role: true,
					provider: true,
					profession: true,
				},
			});

			return res.status(200).json(user);
		} catch (error) {
			console.error("Update profile failed:", error);
			return res.status(500).json({ message: "update profile failed" });
		}
	},
);

app.listen(port, "0.0.0.0", () => {
	console.log(`Authentication module running on ${port}`);
});
