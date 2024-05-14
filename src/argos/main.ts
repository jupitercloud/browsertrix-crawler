#!/usr/bin/env -S node --experimental-global-webcrypto

import { logger } from "../util/logger.js";
import { parseArgs } from "./config.js";
import { ArgosService } from "./service.js";

const config = parseArgs(process.argv);
const svc: ArgosService = new ArgosService(config);

async function handleTerminate(signame: string) {
  logger.info(`${signame} received...`);
  svc?.shutdown();
}
process.on("SIGINT", () => handleTerminate("SIGINT"));
process.on("SIGTERM", () => handleTerminate("SIGTERM"));

await svc.initialize();

svc
  .run()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    logger.fatal("Critical Argos error", { error: error });
    process.exit(1);
  });
