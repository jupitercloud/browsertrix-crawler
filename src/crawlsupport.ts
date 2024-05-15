import child_process, { ChildProcess, StdioOptions } from "child_process";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { LogContext, logger } from "./util/logger.js";
import { sleep } from "./util/timing.js";
import { Redis } from "ioredis";

export interface CrawlSupportParams {
  cwd: string;
  debugAccessRedis: boolean;
  headless: boolean;
  logging: string[];
  logDir: string;
  logLevel: string[];
  logContext: LogContext[];
  logExcludeContext: LogContext[];
  redisStoreUrl: string | undefined;
  restartsOnError: boolean;
}

/** Support services for crawling */
export class CrawlSupport {
  private _params: CrawlSupportParams;
  private _subprocesses: ChildProcess[] = [];
  private _runDetached: boolean;
  private _redis: Redis;

  constructor(params: CrawlSupportParams) {
    const redisUrl = params.redisStoreUrl || "redis://localhost:6379/0";
    this._params = params;
    this._runDetached = process.env.DETACHED_CHILD_PROC == "1";
    this._redis = new Redis(redisUrl, { lazyConnect: true });
  }

  public get redis(): Redis {
    return this._redis;
  }

  public get runDetached(): boolean {
    return this._runDetached;
  }

  private async _launchRedis() {
    let redisStdio: StdioOptions;

    if (this._params.logging.includes("redis")) {
      const redisStderr = fs.openSync(
        path.join(this._params.logDir, "redis.log"),
        "a",
      );
      redisStdio = [process.stdin, redisStderr, redisStderr];
    } else {
      redisStdio = "ignore";
    }

    let redisArgs: string[] = [];
    if (this._params.debugAccessRedis) {
      redisArgs = ["--protected-mode", "no"];
    }

    const redisData = path.join(this._params.cwd, "redis");
    await fsp.mkdir(redisData, { recursive: true });

    return child_process.spawn("redis-server", redisArgs, {
      cwd: redisData,
      stdio: redisStdio,
      detached: this.runDetached,
    });
  }

  private async _connectRedis() {
    const redisUrl = this._params.redisStoreUrl || "redis://localhost:6379/0";

    if (!redisUrl.startsWith("redis://")) {
      logger.fatal(
        "redisStoreUrl must start with redis:// -- Only redis-based store currently supported",
      );
    }

    while (true) {
      try {
        await this._redis.connect();
        break;
      } catch (e) {
        logger.warn(`Waiting for redis at ${redisUrl}`, {}, "state");
        await sleep(1);
      }
    }
  }

  private _initializeLogging() {
    const debugLogging = this._params.logging.includes("debug");
    logger.setDebugLogging(debugLogging);
    logger.setLogLevel(this._params.logLevel);
    logger.setContext(this._params.logContext);
    logger.setExcludeContext(this._params.logExcludeContext);

    // if automatically restarts on error exit code,
    // exit with 0 from fatal by default, to avoid unnecessary restart
    // otherwise, exit with default fatal exit code
    if (this._params.restartsOnError) {
      logger.setDefaultFatalExitCode(0);
    }
  }

  async initialize() {
    this._initializeLogging();
    logger.debug("Initializing CrawlSupport", {}, "general");
    await fsp.mkdir(this._params.logDir, { recursive: true });
    if (!this._params.redisStoreUrl) {
      this._subprocesses.push(await this._launchRedis());
    }

    this._subprocesses.push(
      child_process.spawn(
        "socat",
        ["tcp-listen:9222,reuseaddr,fork", "tcp:localhost:9221"],
        { detached: this.runDetached },
      ),
    );

    if (!this._params.headless && !process.env.NO_XVFB) {
      this._subprocesses.push(
        child_process.spawn(
          "Xvfb",
          [
            process.env.DISPLAY || "",
            "-listen",
            "tcp",
            "-screen",
            "0",
            process.env.GEOMETRY || "",
            "-ac",
            "+extension",
            "RANDR",
          ],
          { detached: this.runDetached },
        ),
      );
    }

    await this._connectRedis();
  }

  async shutdown() {
    logger.debug("Shutting down CrawlSupport", {}, "general");
    await this._redis.quit();
    for (const proc of this._subprocesses) {
      proc.kill();
    }
  }
}
