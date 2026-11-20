/**
 * Creates the one superAdmin account. Run ONCE with:  npm run create-superadmin
 *
 * It reads SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD from ai-server/.env,
 * saves a hashed copy in storage/superadmin.json and refuses to run a second
 * time. To replace the account later, delete storage/superadmin.json first.
 */
import { config } from "../src/config/env.js";
import { SuperAdminService } from "../src/services/SuperAdminService.js";

const email = (process.env.SUPERADMIN_EMAIL ?? "").trim();
const password = process.env.SUPERADMIN_PASSWORD ?? "";

if (!email || !password) {
  console.error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in ai-server/.env first.");
  process.exit(1);
}

try {
  await new SuperAdminService(config.dataDir, config.sessionHours).create(email, password);
  console.log(`SuperAdmin created for ${email}.`);
  console.log("You can now delete SUPERADMIN_PASSWORD from .env: only a hashed copy is kept.");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
