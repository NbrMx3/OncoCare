import { RiskLevel } from "@prisma/client";

export const predictRisk = (symptomsText: string): {
	riskLevel: RiskLevel;
	score: number;
	recommendation: string;
} => {
	const value = symptomsText.toLowerCase();
	let score = 0;

	const map: Array<{ terms: string[]; points: number }> = [
		{ terms: ["lump", "mass"], points: 30 },
		{ terms: ["bleeding", "blood"], points: 20 },
		{ terms: ["weight loss", "fatigue"], points: 15 },
		{ terms: ["persistent pain", "pain"], points: 15 },
		{ terms: ["family history", "genetic"], points: 20 },
		{ terms: ["persistent cough"], points: 12 },
	];

	for (const item of map) {
		if (item.terms.some((term) => value.includes(term))) {
			score += item.points;
		}
	}

	if (score >= 55) {
		return {
			riskLevel: RiskLevel.HIGH,
			score,
			recommendation:
				"Immediate oncology referral, diagnostics, and close follow-up within 7 days.",
		};
	}

	if (score >= 25) {
		return {
			riskLevel: RiskLevel.MEDIUM,
			score,
			recommendation:
				"Order targeted tests and schedule follow-up in 2-4 weeks.",
		};
	}

	return {
		riskLevel: RiskLevel.LOW,
		score,
		recommendation:
			"Provide prevention guidance and routine check-up scheduling.",
	};
};
