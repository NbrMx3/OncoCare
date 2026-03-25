import dotenv from "dotenv";
import express, { Request, Response } from "express";

dotenv.config();

const app = express();
const port = Number(process.env.GATEWAY_PORT) || 5000;

app.use(express.json());

const moduleTargets: Array<{ prefix: string; target: string }> = [
	{ prefix: "/api/auth", target: `http://localhost:${process.env.AUTH_PORT || 5101}` },
	{ prefix: "/api/patients", target: `http://localhost:${process.env.PATIENT_PORT || 5102}` },
	{ prefix: "/api/assessments", target: `http://localhost:${process.env.RISK_PORT || 5103}` },
	{ prefix: "/api/appointments", target: `http://localhost:${process.env.MONITORING_PORT || 5104}` },
	{ prefix: "/api/monitoring", target: `http://localhost:${process.env.MONITORING_PORT || 5104}` },
	{ prefix: "/api/treatments", target: `http://localhost:${process.env.TREATMENT_PORT || 5105}` },
	{ prefix: "/api/notifications", target: `http://localhost:${process.env.NOTIFICATION_PORT || 5106}` },
	{ prefix: "/api/dashboard", target: `http://localhost:${process.env.DASHBOARD_PORT || 5107}` },
];

const pickTarget = (path: string): string | undefined => {
	const match = moduleTargets.find((route) => path.startsWith(route.prefix));
	return match?.target;
};

const proxyRequest = async (req: Request, res: Response) => {
	const target = pickTarget(req.path);
	if (!target) {
		return res.status(404).json({ message: "no module route for this endpoint" });
	}

	const url = `${target}${req.originalUrl}`;

	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (!value || key.toLowerCase() === "host" || key.toLowerCase() === "content-length") {
			continue;
		}
		headers.set(key, Array.isArray(value) ? value.join(",") : value);
	}

	const method = req.method.toUpperCase();
	const hasBody = !["GET", "HEAD"].includes(method);
	const requestInit: RequestInit = {
		method,
		headers,
	};

	if (hasBody) {
		requestInit.body = JSON.stringify(req.body ?? {});
	}

	try {
		const response = await fetch(url, requestInit);

		const text = await response.text();
		const contentType = response.headers.get("content-type") || "application/json";
		res.status(response.status);
		res.setHeader("content-type", contentType);
		return res.send(text);
	} catch (error) {
		console.error("Gateway proxy failed:", error);
		return res.status(502).json({ message: "module unavailable" });
	}
};

app.get("/health", (_req: Request, res: Response) => {
	res.status(200).json({ ok: true, service: "api-gateway" });
});

app.all("/api/*", proxyRequest);

app.listen(port, () => {
	console.log(`API gateway running on ${port}`);
});
