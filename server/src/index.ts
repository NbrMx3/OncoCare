import dotenv from "dotenv";

dotenv.config();

console.log("OncoCare module servers are independent processes.");
console.log("Run one or all module servers using npm scripts, for example:");
console.log("npm run dev:auth");
console.log("npm run dev:patient");
console.log("npm run dev:risk");
console.log("npm run dev:monitoring");
console.log("npm run dev:treatment");
console.log("npm run dev:notification");
console.log("npm run dev:dashboard");
