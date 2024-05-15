import yargs, { Options } from "yargs";
import { hideBin } from "yargs/helpers";

import type { CrawlSupportParams } from "../crawlsupport.js";
import {
  DEFAULT_EXCLUDE_LOG_CONTEXTS,
  LOG_CONTEXT_TYPES,
} from "../util/logger.js";

export interface ArgosConfig extends CrawlSupportParams {
  cwd: string;
  redisStoreUrl: string | undefined;
  crawlerServer: string;
  crawlerToken: string;
}

const coerce = (array: string[]) => {
  return array.flatMap((v) => v.split(",")).filter((x) => !!x);
};

function cliOptions(): { [key: string]: Options } {
  return {
    /*
    workers: {
      alias: "w",
      describe: "The number of workers to run in parallel",
      default: 1,
      type: "number",
    },
    */

    /*
    maxPageLimit: {
      describe:
        "Maximum pages to crawl, overriding  pageLimit if both are set",
      default: 0,
      type: "number",
    },
    */

    headless: {
      describe: "Run in headless mode, otherwise start xvfb",
      type: "boolean",
      default: false,
    },

    logging: {
      describe:
        "Logging options for crawler, can include: stats (enabled by default), jserrors, debug",
      type: "array",
      default: ["stats"],
      coerce,
    },

    logLevel: {
      describe: "Comma-separated list of log levels to include in logs",
      type: "array",
      default: [],
      coerce,
    },

    context: {
      alias: "logContext",
      describe: "Comma-separated list of contexts to include in logs",
      type: "array",
      default: [],
      choices: LOG_CONTEXT_TYPES,
      coerce,
    },

    logExcludeContext: {
      describe: "Comma-separated list of contexts to NOT include in logs",
      type: "array",
      default: DEFAULT_EXCLUDE_LOG_CONTEXTS,
      choices: LOG_CONTEXT_TYPES,
      coerce,
    },

    cwd: {
      describe:
        "Crawl working directory for captures (pywb root). If not set, defaults to process.cwd()",
      type: "string",
      default: process.cwd(),
    },

    redisStoreUrl: {
      describe:
        "If set, url for remote redis server to store state. Otherwise, an embedded redis is launched.",
      type: "string",
      default: undefined,
    },

    crawlerServer: {
      describe: "URL to the crawler server.",
      type: "string",
      demandOption: true,
    },

    crawlerToken: {
      describe: "Token for access to the crawler server.",
      type: "string",
      demandOption: true,
    },
  };
}

export function parseArgs(argv: string[]): ArgosConfig {
  return (
    yargs(hideBin(argv))
      .usage("argos [options]")
      .option(cliOptions())
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .check((_argv) => true).argv as unknown as ArgosConfig
  );
}
