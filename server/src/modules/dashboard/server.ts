import dotenv from "dotenv";
import { Response } from "express";
import { AppointmentStatus, RiskLevel, Role } from "@prisma/client";
import { prisma } from "../../prisma";
import {
	AuthenticatedRequest,
	authenticateToken,
	authorizeRoles,
} from "../../common/auth";
import { createModuleApp } from "../../common/app";

dotenv.config();

const app = createModuleApp("dashboard");
const port = Number(process.env.PORT) || Number(process.env.DASHBOARD_PORT) || 5107;

app.get(
	"/api/dashboard/stats",
	authenticateToken,
	authorizeRoles([Role.ADMIN, Role.DOCTOR]),
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			const doctorId = req.userId as string;
			const patientFilter = req.role === Role.DOCTOR ? { appointments: { some: { doctorId } } } : {};
			const appointmentFilter = req.role === Role.DOCTOR ? { doctorId } : {};

			const [patients, assessments, appointments, missedAppointments, notifications] =
				await Promise.all([
					prisma.patient.count({ where: patientFilter }),
					prisma.cancerAssessment.findMany({ where: { patient: patientFilter } }),
					prisma.appointment.count({ where: appointmentFilter }),
					prisma.appointment.count({
						where: { ...appointmentFilter, status: AppointmentStatus.MISSED },
					}),
					prisma.notification.count({
						where: req.role === Role.DOCTOR ? { patient: { appointments: { some: { doctorId } } } } : {},
					}),
				]);

			const riskLevels = {
				LOW: assessments.filter((a) => a.riskLevel === RiskLevel.LOW).length,
				MEDIUM: assessments.filter((a) => a.riskLevel === RiskLevel.MEDIUM).length,
				HIGH: assessments.filter((a) => a.riskLevel === RiskLevel.HIGH).length,
			};

			const trends = assessments.reduce<Record<string, number>>((acc, row) => {
				const month = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, "0")}`;
				acc[month] = (acc[month] ?? 0) + 1;
				return acc;
			}, {});

			return res.status(200).json({
				totalPatients: patients,
				totalAssessments: assessments.length,
				totalAppointments: appointments,
				missedAppointments,
				totalNotifications: notifications,
				riskLevels,
				trends,
			});
		} catch (error) {
			console.error("Dashboard stats failed:", error);
			return res.status(500).json({ message: "dashboard stats failed" });
		}
	},
);

app.get(
	"/api/dashboard/audit-logs",
	authenticateToken,
	authorizeRoles([Role.ADMIN]),
	async (_req: AuthenticatedRequest, res: Response) => {
		try {
			const logs = await prisma.auditLog.findMany({
				orderBy: { createdAt: "desc" },
				take: 200,
			});
			return res.status(200).json(logs);
		} catch (error) {
			console.error("Audit logs failed:", error);
			return res.status(500).json({ message: "audit logs failed" });
		}
	},
);

app.listen(port, "0.0.0.0", () => {
	console.log(`Dashboard module running on ${port}`);
});
