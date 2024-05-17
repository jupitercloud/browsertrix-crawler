import { ArgosConfig } from "./config.js";
import { CrawlSupport } from "../crawlsupport.js";
import { logger } from "../util/logger.js";
import * as crawlerArgs from "../util/argParser.js";
import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { Crawler } from "../crawler.js";

interface CrawlJob {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any; // Browsertix crawl config
}

const contentMetadata: Array<[RegExp, string]> = [
  [/\.cdxj$/i, "application/cdxj"],
  [/\.gz/i, "application/gzip"],
  [/\.json$/i, "application/json"],
  [/\.jsonl$/i, "application/jsonlines"],
  [/\.yaml$|\.yml$/i, "application/yaml"],
  [/\.warc$/i, "application/warc"],
  [/\.jpg$|\.jpeg$/i, "image/jpeg"],
  [/\.png$/i, "image/png"],
  [/\.log/i, "text/plain"],
  [/\.html$/i, "text/html"],
];

function getContentType(filename: string): string {
  for (const [pattern, contentType] of contentMetadata) {
    if (pattern.test(filename)) {
      return contentType;
    }
  }
  return "application/octet-stream";
}

function getFilesRecursively(directory: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(directory);

  list.forEach((file) => {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath));
    } else {
      results.push(filePath);
    }
  });

  return results;
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
    let crawlCount = 0;
    while (
      this._runSwitch &&
      (!this._config.crawlLimit || crawlCount < this._config.crawlLimit)
    ) {
      const crawlJob = await this._receiveJob();
      if (crawlJob) {
        crawlCount++;
        await this._executeCrawl(crawlJob);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    this._terminated = true;
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down Argos");
    while (!this._terminated) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await this._crawlSupport.shutdown();
  }

  // Signal the process to gracefully stop. Call shutdown() subsequently to wait for completion.
  stop(): void {
    this._runSwitch = false;
  }

  private _requestOptions(): AxiosRequestConfig {
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
      return data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      logger.warn("Failed to receive next job", { error: e.message });
      return null;
    }
  }

  private async _executeCrawl(crawlJob: CrawlJob): Promise<void> {
    logger.info("Running crawl job", crawlJob);
    const { crawlId } = crawlJob.config;
    const configPath = path.join(this._config.cwd, crawlId + "-config.yaml");
    let error: Error | null = null;
    try {
      fs.writeFileSync(configPath, yaml.dump(crawlJob.config), {
        encoding: "utf8",
      });
      const argParser = new crawlerArgs.ArgParser();
      const args = argParser.parseArgs(
        ["node", "crawler", "--config", configPath],
        false,
        false,
      );
      const crawler = new Crawler(
        args.parsed,
        args.origConfig,
        this._crawlSupport,
      );
      // Clear crawl state before and after execution to
      // 1. Ensure crawl retries run from a fresh start
      // 2. Clean up redis after use
      await crawler
        .resetCrawlState()
        .then(() => crawler.run())
        .finally(() => crawler.resetCrawlState());
      await this._uploadArtifacts(crawler, configPath);
    } catch (_error) {
      error = _error as Error;
    } finally {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    }
    if (error) {
      return this._failCrawl(crawlJob, error as Error);
    }
    return this._completeCrawl(crawlJob);
  }

  private async _uploadArtifact(crawlId: string, file: string): Promise<void> {
    const contentType = getContentType(file);
    const form = new FormData();
    form.append("crawl-id", crawlId);
    form.append("artifact", fs.createReadStream(file), {
      filename: path.basename(file),
      contentType,
    });

    const options = this._requestOptions();
    options.headers = { ...options.headers, ...form.getHeaders() };

    try {
      await axios.post(`${this._config.crawlerServer}/artifact`, form, options);
      logger.debug(`Uploaded artifact ${file}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      logger.warn(`Upload artifact failed: ${error.message}`, { error, file });
      throw error;
    }
  }

  private async _uploadArtifacts(
    crawler: Crawler,
    configPath: string,
  ): Promise<void> {
    const crawlId = crawler.crawlId;
    const files = getFilesRecursively(crawler.collDir);
    files.push(configPath);
    logger.debug("Uploading artifact files", { crawlId, files });
    await Promise.all(files.map((file) => this._uploadArtifact(crawlId, file)));
  }

  private async _completeCrawl(crawlJob: CrawlJob): Promise<void> {
    const crawlParams = {
      "crawl-id": crawlJob.config.crawlId,
    };
    logger.info("Completed crawl job", crawlParams);
    return axios
      .post(
        `${this._config.crawlerServer}/complete`,
        crawlParams,
        this._requestOptions(),
      )
      .then(() => undefined)
      .catch((e) => logger.error("Failed to report crawl error", { error: e }));
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
