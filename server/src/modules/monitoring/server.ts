import dotenv from "dotenv";
import { Response } from "express";
import { AppointmentStatus, Role, RiskLevel } from "@prisma/client";
import { prisma } from "../../prisma";
import {
	AuthenticatedRequest,
	authenticateToken,
	authorizeRoles,
} from "../../common/auth";
import { createModuleApp } from "../../common/app";
import { resolveModulePort } from "../../common/ports";

dotenv.config();

const app = createModuleApp("monitoring");
const port = resolveModulePort("MONITORING_PORT", 5104);

app.post(
	"/api/appointments",
	authenticateToken,
	authorizeRoles([Role.ADMIN, Role.DOCTOR]),
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			const { patientId, doctorId, date, status, notes } = req.body as {
				patientId?: string;
				doctorId?: string;
				date?: string;
				status?: AppointmentStatus;
				notes?: string;
			};

			if (!patientId || !doctorId || !date || !status) {
				return res.status(400).json({
					message: "patientId, doctorId, date and status are required",
				});
			}

			const appointment = await prisma.appointment.create({
				data: {
					patientId,
					doctorId,
					date: new Date(date),
					status,
					notes: notes ?? null,
				},
			});

			return res.status(201).json(appointment);
		} catch (error) {
			console.error("Create appointment failed:", error);
			return res.status(500).json({ message: "create appointment failed" });
		}
	},
);

app.get(
	"/api/appointments",
	authenticateToken,
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			if (!req.role || !req.userId) {
				return res.status(401).json({ message: "unauthorized" });
			}

			const where =
				req.role === Role.ADMIN
					? {}
					: req.role === Role.DOCTOR
						? { doctorId: req.userId }
						: { patient: { userId: req.userId } };

			const appointments = await prisma.appointment.findMany({
				where,
				orderBy: { date: "asc" },
				include: { patient: true },
			});
			return res.status(200).json(appointments);
		} catch (error) {
			console.error("List appointments failed:", error);
			return res.status(500).json({ message: "list appointments failed" });
		}
	},
);

app.patch(
	"/api/appointments/:id/status",
	authenticateToken,
	authorizeRoles([Role.ADMIN, Role.DOCTOR]),
	async (_req: AuthenticatedRequest, res: Response) => {
		try {
			const id = String(_req.params.id);
			const { status } = _req.body as { status?: AppointmentStatus };
			if (!status) {
				return res.status(400).json({ message: "status is required" });
			}

			const appointment = await prisma.appointment.update({
				where: { id },
				data: { status },
			});
			return res.status(200).json(appointment);
		} catch (error) {
			console.error("Update appointment failed:", error);
			return res.status(500).json({ message: "update appointment failed" });
		}
	},
);

app.get(
	"/api/monitoring/flags",
	authenticateToken,
	authorizeRoles([Role.ADMIN, Role.DOCTOR]),
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			if (!req.userId || !req.role) {
				return res.status(401).json({ message: "unauthorized" });
			}

			const doctorFilter = req.role === Role.DOCTOR ? { doctorId: req.userId } : {};

			const missedAppointments = await prisma.appointment.findMany({
				where: { ...doctorFilter, status: AppointmentStatus.MISSED },
				orderBy: { date: "desc" },
			});

			const highRiskWhere =
				req.role === Role.DOCTOR
					? {
						riskLevel: RiskLevel.HIGH,
						patient: { appointments: { some: { doctorId: req.userId } } },
					}
					: { riskLevel: RiskLevel.HIGH };

			const highRiskAssessments = await prisma.cancerAssessment.findMany({
				where: highRiskWhere,
				orderBy: { createdAt: "desc" },
				include: { patient: true },
				distinct: ["patientId"],
			});

			return res.status(200).json({ missedAppointments, highRiskAssessments });
		} catch (error) {
			console.error("Monitoring flags failed:", error);
			return res.status(500).json({ message: "monitoring flags failed" });
		}
	},
);

app.listen(port, "0.0.0.0", () => {
	console.log(`Monitoring module running on ${port}`);
});
