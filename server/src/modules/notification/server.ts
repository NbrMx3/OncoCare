import dotenv from "dotenv";
import { Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../../prisma";
import {
	AuthenticatedRequest,
	authenticateToken,
	authorizeRoles,
} from "../../common/auth";
import { createModuleApp } from "../../common/app";

dotenv.config();

const app = createModuleApp("notification");
const port = Number(process.env.NOTIFICATION_PORT) || 5106;

app.post(
	"/api/notifications",
	authenticateToken,
	authorizeRoles([Role.ADMIN, Role.DOCTOR]),
	async (_req: AuthenticatedRequest, res: Response) => {
		try {
			const { patientId, message, type } = _req.body as {
				patientId?: string;
				message?: string;
				type?: string;
			};

			if (!patientId || !message || !type) {
				return res.status(400).json({ message: "patientId, message and type are required" });
			}

			const status = type.toUpperCase() === "SMS" || type.toUpperCase() === "EMAIL" ? "SENT" : "FAILED";

			const notification = await prisma.notification.create({
				data: {
					patientId,
					message,
					type: type.toUpperCase(),
					status,
				},
			});

			return res.status(201).json({
				notification,
				delivery: `Simulated ${notification.type} delivery ${notification.status}`,
			});
		} catch (error) {
			console.error("Send notification failed:", error);
			return res.status(500).json({ message: "send notification failed" });
		}
	},
);

app.get(
	"/api/notifications/patient/:patientId",
	authenticateToken,
	async (_req: AuthenticatedRequest, res: Response) => {
		try {
			const patientId = String(_req.params.patientId);
			const notifications = await prisma.notification.findMany({
				where: { patientId },
				orderBy: { createdAt: "desc" },
			});
			return res.status(200).json(notifications);
		} catch (error) {
			console.error("List notifications failed:", error);
			return res.status(500).json({ message: "list notifications failed" });
		}
	},
);

app.listen(port, () => {
	console.log(`Notification module running on ${port}`);
});
