export const resolveModulePort = (modulePortEnv: string, defaultPort: number): number => {
	const modulePortRaw = process.env[modulePortEnv];
	const modulePort = modulePortRaw ? Number(modulePortRaw) : Number.NaN;
	if (Number.isFinite(modulePort) && modulePort > 0) {
		return modulePort;
	}

	const portRaw = process.env.PORT;
	const port = portRaw ? Number(portRaw) : Number.NaN;
	const gatewayPortRaw = process.env.GATEWAY_PORT;
	const gatewayPort = gatewayPortRaw ? Number(gatewayPortRaw) : Number.NaN;

	const reservedPorts = new Set<number>([5000]);
	if (Number.isFinite(gatewayPort) && gatewayPort > 0) {
		reservedPorts.add(gatewayPort);
	}

	// In local multi-service dev, a shared PORT (often 5000) is intended for the gateway.
	// On platforms like Render, each service gets its own PORT, so we honor it there.
	if (Number.isFinite(port) && port > 0 && !reservedPorts.has(port)) {
		return port;
	}

	return defaultPort;
};
