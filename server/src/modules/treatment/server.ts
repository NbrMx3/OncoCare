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

const app = createModuleApp("treatment");
const port = Number(process.env.PORT) || Number(process.env.TREATMENT_PORT) || 5105;

app.post(
	"/api/treatments",
	authenticateToken,
	authorizeRoles([Role.ADMIN, Role.DOCTOR]),
	async (_req: AuthenticatedRequest, res: Response) => {
		try {
			const { patientId, type, startDate, endDate, status, notes } = _req.body as {
				patientId?: string;
				type?: string;
				startDate?: string;
				endDate?: string;
				status?: string;
				notes?: string;
			};

			if (!patientId || !type || !startDate || !status) {
				return res.status(400).json({
					message: "patientId, type, startDate and status are required",
				});
			}

			const treatment = await prisma.treatment.create({
				data: {
					patientId,
					type,
					startDate: new Date(startDate),
					endDate: endDate ? new Date(endDate) : null,
					status,
					notes: notes ?? null,
				},
			});

			return res.status(201).json(treatment);
		} catch (error) {
			console.error("Create treatment failed:", error);
			return res.status(500).json({ message: "create treatment failed" });
		}
	},
);

app.get(
	"/api/treatments/patient/:patientId",
	authenticateToken,
	async (_req: AuthenticatedRequest, res: Response) => {
		try {
			const patientId = String(_req.params.patientId);
			const treatments = await prisma.treatment.findMany({
				where: { patientId },
				orderBy: { createdAt: "desc" },
			});
			return res.status(200).json(treatments);
		} catch (error) {
			console.error("List treatments failed:", error);
			return res.status(500).json({ message: "list treatments failed" });
		}
	},
);

app.patch(
	"/api/treatments/:id",
	authenticateToken,
	authorizeRoles([Role.ADMIN, Role.DOCTOR]),
	async (_req: AuthenticatedRequest, res: Response) => {
		try {
			const id = String(_req.params.id);
			const { status, notes, endDate } = _req.body as {
				status?: string;
				notes?: string;
				endDate?: string;
			};

			const data: {
				status?: string;
				notes?: string | null;
				endDate?: Date | null;
			} = {};

			if (status !== undefined) data.status = status;
			if (notes !== undefined) data.notes = notes;
			if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;

			const treatment = await prisma.treatment.update({ where: { id }, data });
			return res.status(200).json(treatment);
		} catch (error) {
			console.error("Update treatment failed:", error);
			return res.status(500).json({ message: "update treatment failed" });
		}
	},
);

app.listen(port, () => {
	console.log(`Treatment module running on ${port}`);
});
