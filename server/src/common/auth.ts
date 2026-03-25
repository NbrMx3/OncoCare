import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

const jwtSecret = process.env.JWT_SECRET || "change_me_in_production";

export type AuthenticatedRequest = Request & {
	userId?: string;
	role?: Role;
};

type JwtPayload = {
	userId: string;
	role: Role;
};

export const signToken = (user: { id: string; role: Role }) => {
	return jwt.sign({ userId: user.id, role: user.role }, jwtSecret, {
		expiresIn: "7d",
	});
};

export const authenticateToken = (
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction,
) => {
	const authHeader = req.headers.authorization;
	const token = authHeader?.startsWith("Bearer ")
		? authHeader.slice(7)
		: undefined;

	if (!token) {
		return res.status(401).json({ message: "missing auth token" });
	}

	try {
		const payload = jwt.verify(token, jwtSecret) as JwtPayload;
		req.userId = payload.userId;
		req.role = payload.role;
		next();
	} catch {
		return res.status(401).json({ message: "invalid auth token" });
	}
};

export const authorizeRoles =
	(roles: Role[]) =>
	(req: AuthenticatedRequest, res: Response, next: NextFunction) => {
		if (!req.role || !roles.includes(req.role)) {
			return res.status(403).json({ message: "forbidden" });
		}
		next();
	};
