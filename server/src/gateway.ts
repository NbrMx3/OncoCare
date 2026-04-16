import dotenv from "dotenv";
import cors from "cors";
import express, { Request, Response } from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || Number(process.env.GATEWAY_PORT) || 5000;

const allowedOrigins = (process.env.CORS_ORIGINS || "")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const corsOptions: cors.CorsOptions = {
	origin: (origin, callback) => {
		if (!origin) {
			return callback(null, true);
		}

		if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
			return callback(null, true);
		}

		return callback(new Error("Not allowed by CORS"));
	},
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

const serviceUrl = (
	baseUrlEnv: string | undefined,
	hostEnv: string | undefined,
	portEnv: string | undefined,
	fallbackPort: number,
) => {
	if (baseUrlEnv) {
		return baseUrlEnv;
	}
	if (hostEnv) {
		const resolvedPort = portEnv ? `:${portEnv}` : "";
		return `http://${hostEnv}${resolvedPort}`;
	}
	return `http://localhost:${fallbackPort}`;
};

const moduleTargets: Array<{ prefix: string; target: string }> = [
	{
		prefix: "/api/auth",
		target: serviceUrl(
			process.env.AUTH_BASE_URL,
			process.env.AUTH_SERVICE_HOST,
			process.env.AUTH_SERVICE_PORT,
			5101,
		),
	},
	{
		prefix: "/api/patients",
		target: serviceUrl(
			process.env.PATIENT_BASE_URL,
			process.env.PATIENT_SERVICE_HOST,
			process.env.PATIENT_SERVICE_PORT,
			5102,
		),
	},
	{
		prefix: "/api/assessments",
		target: serviceUrl(
			process.env.RISK_BASE_URL,
			process.env.RISK_SERVICE_HOST,
			process.env.RISK_SERVICE_PORT,
			5103,
		),
	},
	{
		prefix: "/api/appointments",
		target: serviceUrl(
			process.env.MONITORING_BASE_URL,
			process.env.MONITORING_SERVICE_HOST,
			process.env.MONITORING_SERVICE_PORT,
			5104,
		),
	},
	{
		prefix: "/api/monitoring",
		target: serviceUrl(
			process.env.MONITORING_BASE_URL,
			process.env.MONITORING_SERVICE_HOST,
			process.env.MONITORING_SERVICE_PORT,
			5104,
		),
	},
	{
		prefix: "/api/treatments",
		target: serviceUrl(
			process.env.TREATMENT_BASE_URL,
			process.env.TREATMENT_SERVICE_HOST,
			process.env.TREATMENT_SERVICE_PORT,
			5105,
		),
	},
	{
		prefix: "/api/notifications",
		target: serviceUrl(
			process.env.NOTIFICATION_BASE_URL,
			process.env.NOTIFICATION_SERVICE_HOST,
			process.env.NOTIFICATION_SERVICE_PORT,
			5106,
		),
	},
	{
		prefix: "/api/dashboard",
		target: serviceUrl(
			process.env.DASHBOARD_BASE_URL,
			process.env.DASHBOARD_SERVICE_HOST,
			process.env.DASHBOARD_SERVICE_PORT,
			5107,
		),
	},
];

const pickTarget = (path: string): string | undefined => {
	const match = moduleTargets.find((route) => path.startsWith(route.prefix));
	return match?.target;
};

const proxyRequest = async (req: Request, res: Response) => {
	if (req.method.toUpperCase() === "OPTIONS") {
		return res.status(204).send();
	}

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

		for (const [header, value] of response.headers.entries()) {
			const normalized = header.toLowerCase();
			if (["content-length", "connection", "keep-alive", "transfer-encoding"].includes(normalized)) {
				continue;
			}
			res.setHeader(header, value);
		}

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

app.all("/api/*path", proxyRequest);

app.listen(port, "0.0.0.0", () => {
	console.log(`API gateway running on ${port}`);
});
