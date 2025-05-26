import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {CodePoints, Entry, Field, FieldDef, Points, Range, UCDFile} from './ucdFile.js';
import {type Logger, getLog} from '@cto.af/log';
import {errCode, isCI} from '@cto.af/utils';
import {Buffer} from 'node:buffer';
import type {FetchOptions} from './types.js';
import type {PathLike} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parse as ucdParse} from './ucd.js';

const UCD_PREFIX = 'https://www.unicode.org/Public/UCD/latest/ucd/';
const BAD_ETAG = '---000---';

export type {
  CodePoints,
  Entry,
  FetchOptions,
  Field,
  FieldDef,
  Points, Range,
  UCDFile,
};

/*
Goals:
- Unicode version bump
- Cache files locally, as needed
*/

export interface UCDoptions {
  /**
   * Where to cache downloaded database files.
   */
  cacheDir?: PathLike;

  /**
   * Parse the file, even if you get a 304 from the web server. Changes the
   * status to 200 in this case.
   */
  alwaysParse?: boolean;

  /**
   * Check for new version, even if we are in CI.  Mostly useful for testing.
   */
  checkinCI?: boolean;

  /**
   * URL prefix for Unicode Database.  Filename is appended to this to get
   * full URL.
   */
  prefix?: string;

  /**
   * Enable verbose logging to stdout.
   */
  verbose?: boolean;
}

interface RequiredUCDoptions {
  cacheDir: string; // Normalized from PathLike
  alwaysParse: boolean;
  checkinCI: boolean;
  prefix: string;
  verbose: boolean;
}

const DEFAULT_UCD_OPTIONS: RequiredUCDoptions = {
  cacheDir: process.cwd(),
  alwaysParse: false,
  checkinCI: false,
  prefix: UCD_PREFIX,
  verbose: false,
};

export interface UCDversion {
  date: Date;
  version: string;
  lastModified: string;
  etag: string;
}

export interface FailRead {
  status: number;
  etag: string;
  lastModified: string;
}

export interface SuccessRead extends FailRead {
  status: 200;
  text: string;
}

export type FileInfo = FailRead extends SuccessRead ?
  SuccessRead :
  FailRead;

export interface SuccessParsedFileInfo extends SuccessRead {
  parsed: UCDFile;
}

export type ParsedFileInfo = SuccessParsedFileInfo | FailRead;

export function isSuccess(fi: FileInfo): fi is SuccessParsedFileInfo {
  return fi.status === 200;
}

function normalizeCacheDir(cacheDir?: PathLike): string {
  if (typeof cacheDir === 'string') {
    return path.resolve(cacheDir);
  } else if (cacheDir instanceof URL) {
    return path.resolve(fileURLToPath(cacheDir));
  } else if (Buffer.isBuffer(cacheDir)) {
    // Not useful, but Buffer is in PathLike
    return path.resolve(cacheDir.toString('utf8'));
  } else if (cacheDir == null) {
    return process.cwd();
  }
  throw new TypeError(`Invalid cacheDir: ${cacheDir}`);
}

export class UCD {
  #opts: RequiredUCDoptions;
  #log: Logger;

  private constructor(options: UCDoptions = {}) {
    this.#opts = {
      ...DEFAULT_UCD_OPTIONS,
      ...options,
      cacheDir: normalizeCacheDir(options.cacheDir),
    };
    this.#log = getLog({
      logLevel: this.#opts.verbose ? 1 : 0,
    });
  }

  public static async create(options: UCDoptions = {}): Promise<UCD> {
    const cd = new UCD(options);
    return cd.init();
  }

  public async init(): Promise<this> {
    try {
      const stats = await fs.stat(this.#opts.cacheDir);
      if (!stats.isDirectory()) {
        throw new Error(`Cache directory not directory: "${this.#opts.cacheDir}"`);
      }
    } catch (e) {
      if (errCode(e, 'ENOENT')) {
        await fs.mkdir(this.#opts.cacheDir, {recursive: true});
      } else {
        throw e;
      }
    }
    await fs.access(this.#opts.cacheDir);
    return this;
  }

  public rmDir(): Promise<void> {
    return fs.rm(this.#opts.cacheDir, {recursive: true});
  }

  public async fetchUCDversion(opts?: FetchOptions): Promise<UCDversion> {
    const fi = await this.#getFile('ReadMe.txt', opts);
    if (!isSuccess(fi)) {
      throw new Error('Version not changed');
    }
    const {text, lastModified, etag} = fi;

    const matchD = text.match(/^# Date: (?<date>\d+-\d+-\d+)/m);
    const matchV = text.match(/Version (?<version>\d+\.\d+\.\d+) of/i);
    if (!matchD?.groups || !matchV?.groups) {
      throw new Error('Invalid ReadMe');
    }
    return {
      date: new Date(matchD.groups.date),
      version: matchV.groups.version,
      lastModified,
      etag,
    };
  }

  public async parse(
    name: string,
    opts?: FetchOptions
  ): Promise<ParsedFileInfo> {
    const info = await this.#getFile(name, opts);
    if (isSuccess(info)) {
      info.parsed = ucdParse(info.text);
    }
    return info;
  }

  /**
   * If the file is in the database, and we've checked in the last 30 days,
   * use the local copy.
   * Otherwise, check to see if it's changed.  If not, use the local copy.
   * Otherwise, get a new copy.
   *
   * @param name
   * @param lastModified If supplied, the value of the last-modified header
   *   from the previous request.
   * @returns
   */
  async #getFile(
    name: string,
    opts?: FetchOptions
  ): Promise<FileInfo> {
    let text = '';
    let status = 500;
    let etag = BAD_ETAG;
    let lastModified = new Date().toUTCString();

    // Never fetch in CI unless forced to.
    if (isCI(opts) && !this.#opts.checkinCI) {
      status = 304;
    } else {
      const u = new URL(name, this.#opts.prefix);

      const init: RequestInit = {
      };
      const headers: [string, string][] = [];
      if (opts?.lastModified) {
        headers.push(['if-modified-since', opts.lastModified]);
      }
      if (opts?.etag) {
        // Apache bug.  Get gzip in etag, but can't send it back.
        const nonGzip = opts.etag.replace(/-gzip"$/, '"');
        headers.push(['if-none-match', nonGzip]);
      }
      if (headers.length) {
        init.headers = headers;
      }

      this.#log.debug('Checking "%s" with headers: %o', u, init.headers);
      const res = await fetch(u, init);
      ({status} = res);
      etag = res.headers.get('etag') ?? etag;
      lastModified = res.headers.get('last-modified') ?? lastModified;
      switch (res.status) {
        case 200:
          text = await res.text();
          await this.#setLocal(name, text);
          break;
        case 304:
          break;
        default:
          this.#log.error('Unexpected HTTP status: %d', status);
          throw new Error(`HTTP Status ${status}`);
      }
    }

    if (status === 304) {
      if (this.#opts.alwaysParse) {
        text = await this.#getLocal(name);
        status = 200;
      } else {
        return {
          etag: opts?.etag ?? BAD_ETAG,
          lastModified: opts?.lastModified ?? new Date().toUTCString(),
          status,
        };
      }
    }

    const success: SuccessRead = {
      etag,
      lastModified,
      status: 200,
      text,
    };
    return success;
  }

  #fileName(name: string): string {
    return path.join(this.#opts.cacheDir, name);
  }

  #getLocal(name: string): Promise<string> {
    return fs.readFile(this.#fileName(name), 'utf8');
  }

  async #setLocal(name: string, text: string): Promise<void> {
    const fn = this.#fileName(name);
    return fs.writeFile(fn, text, 'utf8');
  }
}
