import cors from "cors";
import express, { NextFunction, Request, Response } from "express";

export const createModuleApp = (moduleName: string) => {
	const app = express();
	app.use(cors());
	app.use(express.json());

	app.get("/health", (_req: Request, res: Response) => {
		res.status(200).json({ ok: true, module: moduleName });
	});

	app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
		console.error(`[${moduleName}] unhandled route error:`, err);
		res.status(500).json({ message: `${moduleName} module failed` });
	});

	return app;
};
