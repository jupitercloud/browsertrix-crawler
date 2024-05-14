#!/usr/bin/env -S node --experimental-global-webcrypto

import { logger } from "../util/logger.js";
import { parseArgs } from "../util/argParser.js";
import { ArgosService } from "./service.js";

const args = parseArgs();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const params = args.parsed as any;

const svc: ArgosService = new ArgosService({ params: params });

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
