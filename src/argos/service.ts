import { CrawlSupport } from "../crawlsupport.js";
import { logger } from "../util/logger.js";

interface ArgosConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any; // Browsertrix CLI params
}

export class ArgosService {
  private _config: ArgosConfig;
  private _crawlSupport: CrawlSupport;
  private _runSwitch: boolean;
  private _terminated: boolean;

  constructor(config: ArgosConfig) {
    this._config = config;
    this._crawlSupport = new CrawlSupport({
      debugAccessRedis: config.params.debugAccessRedis,
      headless: config.params.headless,
      logging: config.params.logging,
      logDir: config.params.cwd,
      logLevel: config.params.logLevel,
      logContext: config.params.logContext,
      logExcludeContext: config.params.logExcludeContext,
      restartsOnError: config.params.restartsOnError,
    });
    this._runSwitch = false;
    this._terminated = true;
  }

  async initialize(): Promise<void> {
    logger.info("Initializing Argos");
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
