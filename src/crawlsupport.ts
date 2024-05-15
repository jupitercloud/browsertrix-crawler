import child_process, { ChildProcess, StdioOptions } from "child_process";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { LogContext, logger } from "./util/logger.js";

export interface CrawlSupportParams {
  cwd: string;
  debugAccessRedis: boolean;
  headless: boolean;
  logging: string[];
  logDir: string;
  logLevel: string[];
  logContext: LogContext[];
  logExcludeContext: LogContext[];
  restartsOnError: boolean;
}

/** Support services for crawling */
export class CrawlSupport {
  params: CrawlSupportParams;
  subprocesses: ChildProcess[] = [];

  public runDetached: boolean;

  constructor(params: CrawlSupportParams) {
    this.params = params;
    this.runDetached = process.env.DETACHED_CHILD_PROC == "1";
  }

  private async launchRedis() {
    let redisStdio: StdioOptions;

    if (this.params.logging.includes("redis")) {
      const redisStderr = fs.openSync(
        path.join(this.params.logDir, "redis.log"),
        "a",
      );
      redisStdio = [process.stdin, redisStderr, redisStderr];
    } else {
      redisStdio = "ignore";
    }

    let redisArgs: string[] = [];
    if (this.params.debugAccessRedis) {
      redisArgs = ["--protected-mode", "no"];
    }

    const redisData = path.join(this.params.cwd, "redis");
    await fsp.mkdir(redisData, { recursive: true });

    return child_process.spawn("redis-server", redisArgs, {
      cwd: redisData,
      stdio: redisStdio,
      detached: this.runDetached,
    });
  }

  private _initializeLogging() {
    const debugLogging = this.params.logging.includes("debug");
    logger.setDebugLogging(debugLogging);
    logger.setLogLevel(this.params.logLevel);
    logger.setContext(this.params.logContext);
    logger.setExcludeContext(this.params.logExcludeContext);

    // if automatically restarts on error exit code,
    // exit with 0 from fatal by default, to avoid unnecessary restart
    // otherwise, exit with default fatal exit code
    if (this.params.restartsOnError) {
      logger.setDefaultFatalExitCode(0);
    }
  }

  async initialize() {
    this._initializeLogging();
    logger.debug("Initializing CrawlSupport", {}, "general");
    await fsp.mkdir(this.params.logDir, { recursive: true });
    this.subprocesses.push(await this.launchRedis());

    this.subprocesses.push(
      child_process.spawn(
        "socat",
        ["tcp-listen:9222,reuseaddr,fork", "tcp:localhost:9221"],
        { detached: this.runDetached },
      ),
    );

    if (!this.params.headless && !process.env.NO_XVFB) {
      this.subprocesses.push(
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
  }

  async shutdown() {
    logger.debug("Shutting down CrawlSupport", {}, "general");
    for (const proc of this.subprocesses) {
      proc.kill();
    }
  }
}
