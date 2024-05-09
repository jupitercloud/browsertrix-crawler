import child_process, { ChildProcess, StdioOptions } from "child_process";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { logger } from "./util/logger.js";

export interface CrawlSupportParams {
  debugAccessRedis: boolean;
  headless: boolean;
  logging: string[];
  logDir: string;
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

  private launchRedis() {
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

    return child_process.spawn("redis-server", redisArgs, {
      cwd: "/tmp/",
      stdio: redisStdio,
      detached: this.runDetached,
    });
  }

  async initialize() {
    logger.info("Initializing CrawlSupport", {}, "general");
    await fsp.mkdir(this.params.logDir, { recursive: true });
    this.subprocesses.push(this.launchRedis());

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
    logger.info("Shutting down CrawlSupport", {}, "general");
    for (const proc of this.subprocesses) {
      proc.kill();
    }
  }
}
