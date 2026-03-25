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
import { predictRisk } from "../../common/risk";

dotenv.config();

const app = createModuleApp("risk");
const port = Number(process.env.PORT) || Number(process.env.RISK_PORT) || 5103;

app.post(
	"/api/assessments",
	authenticateToken,
	authorizeRoles([Role.ADMIN, Role.DOCTOR]),
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			const { patientId, symptoms } = req.body as {
				patientId?: string;
				symptoms?: string[] | string;
			};

			if (!patientId || !symptoms) {
				return res.status(400).json({ message: "patientId and symptoms are required" });
			}

			const symptomsText = Array.isArray(symptoms) ? symptoms.join(", ") : symptoms;
			const result = predictRisk(symptomsText);

			const assessment = await prisma.cancerAssessment.create({
				data: {
					patientId,
					symptoms: symptomsText,
					riskLevel: result.riskLevel,
					score: result.score,
					recommendation: result.recommendation,
				},
			});

			if (req.userId) {
				await prisma.auditLog.create({
					data: {
						action: "RISK_ASSESSMENT_CREATE",
						userId: req.userId,
						details: `Created assessment ${assessment.id}`,
					},
				});
			}

			return res.status(201).json(assessment);
		} catch (error) {
			console.error("Create assessment failed:", error);
			return res.status(500).json({ message: "create assessment failed" });
		}
	},
);

app.get(
	"/api/assessments/patient/:patientId",
	authenticateToken,
	async (req: AuthenticatedRequest, res: Response) => {
		try {
			const patientId = String(req.params.patientId);
			const assessments = await prisma.cancerAssessment.findMany({
				where: { patientId },
				orderBy: { createdAt: "desc" },
			});
			return res.status(200).json(assessments);
		} catch (error) {
			console.error("List assessments failed:", error);
			return res.status(500).json({ message: "list assessments failed" });
		}
	},
);

app.listen(port, () => {
	console.log(`Risk module running on ${port}`);
});
