#!/usr/bin/env -S node --experimental-global-webcrypto

import path from "path";
import { logger, interceptIoRedisLog } from "./util/logger.js";
import { parseArgs } from "./util/argParser.js";
import type { CrawlError, CrawlResult } from "./crawler.js";
import { Crawler } from "./crawler.js";
import { ReplayCrawler } from "./replaycrawler.js";
import { CrawlSupport } from "./crawlsupport.js";

let crawler: Crawler | null = null;

let lastSigInt = 0;
let forceTerm = false;

async function handleTerminate(signame: string) {
  logger.info(`${signame} received...`);
  if (!crawler || !crawler.crawlState) {
    logger.error("error: no crawler running, exiting");
    process.exit(1);
  }

  if (crawler.done) {
    logger.info("success: crawler done, exiting");
    process.exit(0);
  }

  try {
    if (await crawler.isCanceled()) {
      process.exit(0);
    }

    if (!crawler.interrupted) {
      logger.info("SIGNAL: gracefully finishing current pages...");
      crawler.gracefulFinishOnInterrupt();
    } else if (forceTerm || Date.now() - lastSigInt > 200) {
      logger.info("SIGNAL: stopping crawl now...");
      await crawler.serializeAndAbort();
    }
    lastSigInt = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    logger.error("Error stopping crawl after receiving termination signal", e);
  }
}

// Install middleware to the global console logger
interceptIoRedisLog();

const args = parseArgs();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const params = args.parsed as any;

process.on("SIGINT", () => handleTerminate("SIGINT"));

process.on("SIGTERM", () => handleTerminate("SIGTERM"));

process.on("SIGABRT", async () => {
  logger.info("SIGABRT received, will force immediate exit on SIGTERM/SIGINT");
  forceTerm = true;
});

// Write supporting service logs to collection log directory
const crawlSupportLogDir = path.join(
  params.cwd,
  "collections",
  params.collection,
  "logs",
);

const crawlSupport = new CrawlSupport({
  cwd: params.cwd,
  debugAccessRedis: params.debugAccessRedis,
  headless: params.headless,
  logging: params.logging,
  logDir: crawlSupportLogDir,
  logLevel: params.logLevel,
  logContext: params.logContext,
  logExcludeContext: params.logExcludeContext,
  redisStoreUrl: params.redisStoreUrl,
  restartsOnError: params.restartsOnError,
});

await crawlSupport.initialize();

if (process.argv[1].endsWith("qa")) {
  crawler = new ReplayCrawler(params, args.origConfig, crawlSupport);
} else {
  crawler = new Crawler(params, args.origConfig, crawlSupport);
}

crawler
  .run()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .then(async (_result: CrawlResult) => {
    crawlSupport.shutdown().finally(() => process.exit(0));
  })
  .catch(async (error: CrawlError) => {
    crawlSupport.shutdown().finally(() => process.exit(error.exitCode));
  });
