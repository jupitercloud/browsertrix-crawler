#!/usr/bin/env -S node --experimental-global-webcrypto

import { logger } from "../util/logger.js";
import { parseArgs } from "./config.js";
import { ArgosService } from "./service.js";

const config = parseArgs(process.argv);
const svc: ArgosService = new ArgosService(config);

async function handleTerminate(signame: string) {
  logger.info(`${signame} received...`);
  svc.stop();
}
process.on("SIGINT", () => handleTerminate("SIGINT"));
process.on("SIGTERM", () => handleTerminate("SIGTERM"));
process.on("uncaughtException", (error, origin) => {
  console.error(error);
  logger.error("Uncaught exception", { error: error, origin: origin });
  handleTerminate("uncaughtException");
});

svc
  .initialize()
  .then((svc) => svc.run())
  .then(async () => svc.shutdown().finally(() => process.exit(0)))
  .catch(async (error: Error) => {
    logger.error("Critical Argos error", { error: error });
    return svc.shutdown().finally(() => process.exit(1));
  });
