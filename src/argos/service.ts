import { ArgosConfig } from "./config.js";
import { CrawlSupport } from "../crawlsupport.js";
import { logger } from "../util/logger.js";
import axios from "axios";

interface CrawlJob {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any; // Browsertix crawl config
}

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
      const crawlJob = await this._receiveJob();
      if (crawlJob) {
        await this._executeCrawl(crawlJob);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
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

  private _requestOptions() {
    return { headers: { Authorization: this._config.crawlerToken } };
  }

  private async _receiveJob(): Promise<CrawlJob | null> {
    try {
      const { status, data } = await axios.post(
        `${this._config.crawlerServer}/receive`,
        {},
        this._requestOptions(),
      );
      if (status == 204) {
        logger.debug("No crawl job available");
        return null;
      }
      logger.debug("Job received", { job: data });
      return data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      logger.warn("Failed to receive next job", { error: e.message });
      return null;
    }
  }

  private async _executeCrawl(crawlJob: CrawlJob): Promise<void> {
    return this._failCrawl(crawlJob, new Error("Crawl not implemented"));
  }

  private async _failCrawl(crawlJob: CrawlJob, reason: Error): Promise<void> {
    const errorParams = {
      "crawl-id": crawlJob.config.crawlId,
      error: { message: reason.message },
    };
    logger.warn("Reporting crawl job error", errorParams);
    return axios
      .post(
        `${this._config.crawlerServer}/error`,
        errorParams,
        this._requestOptions(),
      )
      .then(() => undefined)
      .catch((e) => logger.error("Failed to report crawl error", { error: e }));
  }
}
