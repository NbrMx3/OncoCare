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

const isMissingUserOptionalColumnError = (error: unknown): boolean => {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
		return false;
	}

	if (error.code !== "P2022") {
		return false;
	}

	const missingColumn = String(error.meta?.column ?? "").toLowerCase();
	if (missingColumn.includes("profession") || missingColumn.includes("loginid")) {
		return true;
	}

	const modelName = String(error.meta?.modelName ?? "").toLowerCase();
	if (modelName === "user" && (missingColumn === "" || missingColumn === "(not available)")) {
		return true;
	}

	return false;
};

const buildLoginIdSeed = (fullName: string): string => {
	const safeParts = fullName
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.map((part) => part.replace(/[^a-z]/g, ""))
		.filter(Boolean);

	const first = safeParts[0] ?? "usr";
	const second = safeParts[1] ?? "xx";
	return `${first.slice(0, 3).padEnd(3, "x")}${second.slice(0, 2).padEnd(2, "x")}`;
};

const generateUniqueLoginId = async (fullName: string): Promise<string> => {
	const seed = buildLoginIdSeed(fullName);
	let candidate = seed;
	let suffix = 1;

	while (true) {
		const existing = await prisma.user.findUnique({
			where: { loginId: candidate },
			select: { id: true },
		}).catch((error: unknown) => {
			if (!isMissingUserOptionalColumnError(error)) {
				throw error;
			}
			return null;
		});

		if (!existing) {
			return candidate;
		}

		candidate = `${seed}${suffix}`;
		suffix += 1;
	}
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

		const hashed = await bcrypt.hash(password, 10);
		const loginId = await generateUniqueLoginId(name);
		const user = await prisma.user.create({
			data: {
				loginId,
				name,
				email,
				password: hashed,
				role: userRole,
				provider: "local",
				profession: userRole === Role.DOCTOR ? normalizedProfession : null,
			},
			select: {
				id: true,
				loginId: true,
				name: true,
				email: true,
				role: true,
			},
		}).catch(async (error) => {
			if (!isMissingUserOptionalColumnError(error)) {
				throw error;
			}

			return prisma.user.create({
				data: {
					name,
					email,
					password: hashed,
					role: userRole,
					provider: "local",
				},
				select: {
					id: true,
					name: true,
					email: true,
					role: true,
				},
			});
		});

		const token = signToken(user);
		return res.status(201).json({
			token,
			user: {
				id: user.id,
				loginId: (user as { loginId?: string | null }).loginId ?? loginId,
				name: user.name,
				email: user.email,
				role: user.role,
				profession: userRole === Role.DOCTOR ? normalizedProfession : null,
			},
		});
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			return res.status(409).json({ message: "email already exists" });
		}

		console.error("Auth register failed:", error);
		return res.status(500).json({ message: "register failed" });
	}
});

app.post("/api/auth/login", async (req: Request, res: Response) => {
	try {
		const { identifier, email, password } = req.body as {
			identifier?: string;
			email?: string;
			password?: string;
		};

		const loginIdentifier = (identifier ?? email ?? "").trim();

		if (!loginIdentifier || !password) {
			return res.status(400).json({ message: "identifier and password are required" });
		}

		const emailLike = loginIdentifier.includes("@");

		const user = await prisma.user.findFirst({
			where: {
				OR: [{ email: loginIdentifier }, { loginId: loginIdentifier.toLowerCase() }],
			},
			select: {
				id: true,
				loginId: true,
				email: true,
				name: true,
				password: true,
				role: true,
				provider: true,
				profession: true,
			},
		}).catch(async (error) => {
			if (!isMissingUserOptionalColumnError(error)) {
				throw error;
			}

			if (!emailLike) {
				return null;
			}

			const legacyUser = await prisma.user.findUnique({
				where: { email: loginIdentifier },
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
				loginId: null,
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
				loginId: user.loginId,
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

			const googleEmail = profile.email;
			const googleName = profile.name;

			const user = await prisma.user.upsert({
				where: { email: googleEmail },
				create: {
					loginId: await generateUniqueLoginId(googleName),
					name: googleName,
					email: googleEmail,
					role: Role.PATIENT,
					provider: "google",
					profession: null,
				},
				update: {
					name: googleName,
					provider: "google",
				},
				select: {
					id: true,
					loginId: true,
					name: true,
					email: true,
					role: true,
				},
			}).catch(async (error) => {
				if (!isMissingUserOptionalColumnError(error)) {
					throw error;
				}

				return prisma.user.upsert({
					where: { email: googleEmail },
					create: {
						name: googleName,
						email: googleEmail,
						role: Role.PATIENT,
						provider: "google",
					},
					update: {
						name: googleName,
						provider: "google",
					},
					select: {
						id: true,
						name: true,
						email: true,
						role: true,
					},
				});
			});

			const token = signToken(user);
			return res.status(200).json({
				token,
				user: {
					id: user.id,
					loginId: (user as { loginId?: string | null }).loginId ?? null,
					name: user.name,
					email: user.email,
					role: user.role,
				},
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
				select: {
					id: true,
					loginId: true,
					email: true,
					name: true,
					role: true,
					provider: true,
					profession: true,
				},
			}).catch(async (error) => {
				if (!isMissingUserOptionalColumnError(error)) {
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
					loginId: null,
					profession: null,
				};
			});

			if (!user) {
				return res.status(404).json({ message: "user not found" });
			}

			return res.status(200).json({
				id: user.id,
				loginId: user.loginId,
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
					loginId: true,
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
