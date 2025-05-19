import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {CodePoints, Entry, Field, FieldDef, Points, Range, UCDFile} from './ucdFile.js';
import {type Logger, getLog} from '@cto.af/log';
import {errCode, isCI} from '@cto.af/utils';
import {Buffer} from 'node:buffer';
import type {FetchOptions} from './types.js';
import type {PathLike} from 'node:fs';
import assert from 'node:assert';
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
  cacheDir?: PathLike;
  prefix?: string;
  verbose?: boolean;
  checkinCI?: boolean;
}

interface RequiredUCDoptions {
  cacheDir: string; // Normalized from PathLike
  prefix: string;
  verbose: boolean;
  checkinCI: boolean;
}

const DEFAULT_UCD_OPTIONS: RequiredUCDoptions = {
  cacheDir: process.cwd(),
  prefix: UCD_PREFIX,
  verbose: false,
  checkinCI: false,
};

export interface UCDversion {
  date: Date;
  version: string;
  lastModified: string;
  etag: string;
}

export interface FileInfo {
  etag: string;
  lastModified: string;
  status: number;
  text: string | undefined;
  parsed: UCDFile | undefined;
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
    const {text, lastModified, etag} = await this.#getFile('ReadMe.txt', opts);
    assert(text);

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

  public async parse(name: string, opts?: FetchOptions): Promise<FileInfo> {
    const info = await this.#getFile(name, opts);
    if ((info.status === 200) && (typeof info.text === 'string')) {
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
    if (isCI(opts) && !this.#opts.checkinCI) {
      const text = await this.#getLocal(name);
      return {
        etag: opts?.etag ?? BAD_ETAG,
        lastModified: opts?.lastModified ?? new Date().toUTCString(),
        status: 304,
        text,
        parsed: undefined,
      };
    }
    const u = new URL(name, this.#opts.prefix);

    const init: RequestInit = {
    };
    if (opts?.lastModified) {
      init.headers = {'if-modified-since': opts.lastModified};
    }
    if (opts?.etag) {
      init.headers = {'if-none-match': opts.etag};
    }

    this.#log.debug('Checking "%s" with headers: %o', u, init.headers);
    const res = await fetch(u, init);
    const info: FileInfo = {
      etag: res.headers.get('etag') ?? BAD_ETAG,
      lastModified: res.headers.get('last-modified') ?? new Date().toUTCString(),
      status: res.status,
      text: undefined,
      parsed: undefined,
    };

    switch (res.status) {
      case 304:
        info.text = await this.#getLocal(name);
        break;
      case 200:
        info.text = await res.text();
        await this.#setLocal(name, info.text);
        break;
      default:
        this.#log.error('Unexpected HTTP status: %d', info.status);
        throw new Error(`HTTP Status ${info.status}`);
    }
    return info;
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
