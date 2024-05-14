import { ArgosConfig } from "./config.js";
import { CrawlSupport } from "../crawlsupport.js";
import { logger } from "../util/logger.js";

export class ArgosService {
  private _config: ArgosConfig;
  private _crawlSupport: CrawlSupport;
  private _runSwitch: boolean;
  private _terminated: boolean;

  constructor(config: ArgosConfig) {
    this._config = config;
    this._crawlSupport = new CrawlSupport({
      cwd: config.cwd,
      debugAccessRedis: config.debugAccessRedis,
      headless: config.headless,
      logging: config.logging,
      logDir: config.cwd,
      logLevel: config.logLevel,
      logContext: config.logContext,
      logExcludeContext: config.logExcludeContext,
      redisStoreUrl: config.redisStoreUrl,
      restartsOnError: false,
    });
    this._runSwitch = false;
    this._terminated = true;
  }

  async initialize(): Promise<void> {
    logger.info("Initializing Argos", { config: this._config });
    await this._crawlSupport.initialize();
  }

  async run(): Promise<void> {
    logger.info("Running Argos");
    this._runSwitch = true;
    this._terminated = false;
    while (this._runSwitch) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    this._terminated = true;
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down Argos");
    this._runSwitch = false;
    while (!this._terminated) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await this._crawlSupport.shutdown();
  }
}
