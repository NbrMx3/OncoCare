const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const distRoot = path.join(__dirname, "dist");
const services = [
  { name: "gateway", entry: "gateway.js" },
  { name: "auth", entry: "modules/auth/server.js" },
  { name: "patient", entry: "modules/patient/server.js" },
  { name: "risk", entry: "modules/risk/server.js" },
  { name: "monitoring", entry: "modules/monitoring/server.js" },
  { name: "treatment", entry: "modules/treatment/server.js" },
  { name: "notification", entry: "modules/notification/server.js" },
  { name: "dashboard", entry: "modules/dashboard/server.js" },
];

const missingCompiledFiles = () =>
  services.filter((svc) => !fs.existsSync(path.join(distRoot, svc.entry)));

const missing = missingCompiledFiles();
if (missing.length > 0) {
  console.warn("Missing compiled server files. Running npm run build...");
  missing.forEach((svc) => console.warn(`- dist/${svc.entry}`));

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const build = spawnSync(npmCmd, ["run", "build"], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
  });

  if (build.status !== 0) {
    console.error("Build failed. Could not start services.");
    process.exit(build.status ?? 1);
  }

  const stillMissing = missingCompiledFiles();
  if (stillMissing.length > 0) {
    console.error("Compiled files are still missing after build:");
    stillMissing.forEach((svc) => console.error(`- dist/${svc.entry}`));
    process.exit(1);
  }
}

const children = services.map((svc) => {
  const child = spawn(process.execPath, [path.join(distRoot, svc.entry)], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[${svc.name}] exited with ${detail}`);
  });

  return child;
});

const shutdown = () => {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
