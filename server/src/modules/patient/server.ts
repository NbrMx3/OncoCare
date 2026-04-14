import dotenv from "dotenv";
import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../../prisma";
import {
	AuthenticatedRequest,
	authenticateToken,
	authorizeRoles,
} from "../../common/auth";
import { createModuleApp } from "../../common/app";
import { resolveModulePort } from "../../common/ports";

dotenv.config();

const app = createModuleApp("patient");
const port = resolveModulePort("PATIENT_PORT", 5102);

app.post(
	"/api/patients",
	authenticateToken,
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			if (!req.userId || !req.role) {
				return res.status(401).json({ message: "unauthorized" });
			}

			const { userId, name, age, gender, phone, address } = req.body as {
				userId?: string;
				name?: string;
				age?: number;
				gender?: string;
				phone?: string;
				address?: string;
			};

			if (!name || age === undefined || !gender || !phone || !address) {
				return res.status(400).json({
					message: "name, age, gender, phone and address are required",
				});
			}

			if (req.role === Role.PATIENT && userId && userId !== req.userId) {
				return res.status(403).json({ message: "forbidden" });
			}

			if (![Role.ADMIN, Role.DOCTOR, Role.PATIENT].includes(req.role)) {
				return res.status(403).json({ message: "forbidden" });
			}

			const resolvedUserId = req.role === Role.PATIENT ? req.userId : (userId ?? null);

			const patient = await prisma.patient.create({
				data: {
					userId: resolvedUserId,
					name,
					age,
					gender,
					phone,
					address,
				},
			});

			await prisma.auditLog.create({
				data: {
					action: "PATIENT_CREATE",
					userId: req.userId,
					details: `Created patient ${patient.id}`,
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
			if (!req.userId || !req.role) {
				return res.status(401).json({ message: "unauthorized" });
			}

			if (req.role === Role.ADMIN || req.role === Role.DOCTOR) {
				const patients = await prisma.patient.findMany({
					orderBy: { createdAt: "desc" },
				});
				return res.status(200).json(patients);
			}

			const own = await prisma.patient.findMany({
				where: { userId: req.userId },
				orderBy: { createdAt: "desc" },
			});
			return res.status(200).json(own);
		} catch (error) {
			console.error("List patients failed:", error);
			return res.status(500).json({ message: "list patients failed" });
		}
	},
);

app.get(
	"/api/patients/:id",
	authenticateToken,
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			if (!req.userId || !req.role) {
				return res.status(401).json({ message: "unauthorized" });
			}

			const id = String(req.params.id);
			const patient = await prisma.patient.findUnique({
				where: { id },
				include: {
					assessments: { orderBy: { createdAt: "desc" } },
					appointments: { orderBy: { date: "desc" } },
					treatments: { orderBy: { createdAt: "desc" } },
				},
			});

			if (!patient) {
				return res.status(404).json({ message: "patient not found" });
			}

			if (req.role === Role.PATIENT && patient.userId !== req.userId) {
				return res.status(403).json({ message: "forbidden" });
			}

			return res.status(200).json(patient);
		} catch (error) {
			console.error("Get patient failed:", error);
			return res.status(500).json({ message: "get patient failed" });
		}
	},
);

app.put(
	"/api/patients/:id",
	authenticateToken,
	authorizeRoles([Role.ADMIN, Role.DOCTOR]),
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			const id = String(req.params.id);
			const { userId, name, age, gender, phone, address } = req.body as {
				userId?: string | null;
				name?: string;
				age?: number;
				gender?: string;
				phone?: string;
				address?: string;
			};

			const data: {
				userId?: string | null;
				name?: string;
				age?: number;
				gender?: string;
				phone?: string;
				address?: string;
			} = {};

			if (userId !== undefined) data.userId = userId;
			if (name !== undefined) data.name = name;
			if (age !== undefined) data.age = age;
			if (gender !== undefined) data.gender = gender;
			if (phone !== undefined) data.phone = phone;
			if (address !== undefined) data.address = address;

			const patient = await prisma.patient.update({ where: { id }, data });
			return res.status(200).json(patient);
		} catch (error) {
			console.error("Update patient failed:", error);
			return res.status(500).json({ message: "update patient failed" });
		}
	},
);

app.listen(port, "0.0.0.0", () => {
	console.log(`Patient module running on ${port}`);
});
