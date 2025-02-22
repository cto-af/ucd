import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {Buffer} from 'node:buffer';
import {Database} from './db.js';
import type {PathLike} from 'node:fs';
import {UCDFile} from './ucdFile.js';
import {errCode} from './errno.js';
import {fileURLToPath} from 'node:url';
import {parse as ucdParse} from './ucd.js';

const UCD_PREFIX = 'https://www.unicode.org/Public/UCD/latest/ucd/';
const DB_NAME = 'db.json';
const VALID_DAYS = 30;
const VALID_MS = VALID_DAYS * 24 * 60 * 60 * 1000;

/*
Goals:
- Unicode version bump
- Cache files locally, as needed
- Maintain list of etags per file so we can do if-none-match queries
*/

export interface UCDoptions {
  alwaysCheck?: boolean;
  cacheDir?: PathLike;
  prefix?: string;
  validMS?: number;
  verbose?: boolean;
}

interface RequiredUCDoptions {
  alwaysCheck: boolean;
  cacheDir: string;
  prefix: string;
  validMS: number;
  verbose: boolean;
}

export interface UCDversion {
  date: Date;
  version: string;
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

export class CacheDir {
  #opts: RequiredUCDoptions;
  #db: Database;

  private constructor(options: UCDoptions = {}) {
    this.#opts = {
      alwaysCheck: false,
      prefix: UCD_PREFIX,
      validMS: VALID_MS,
      verbose: false,
      ...options,
      cacheDir: normalizeCacheDir(options.cacheDir),
    };
    this.#db = new Database(path.join(this.#opts.cacheDir, DB_NAME));
  }

  public static async create(options: UCDoptions = {}): Promise<CacheDir> {
    const cd = new CacheDir(options);
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
    await this.#db.init();
    return this;
  }

  public rmDir(): Promise<void> {
    return fs.rm(this.#opts.cacheDir, {recursive: true});
  }

  public async fetchUCDversion(): Promise<UCDversion> {
    const readme = await this.#getFile('ReadMe.txt');

    const matchD = readme.match(/^# Date: (?<date>\d+-\d+-\d+)/m);
    const matchV = readme.match(/Version (?<version>\d+\.\d+\.\d+) of/i);
    if (!matchD?.groups || !matchV?.groups) {
      throw new Error('Invalid ReadMe');
    }
    return {
      date: new Date(matchD.groups.date),
      version: matchV.groups.version,
    };
  }

  public async parse(name: string): Promise<UCDFile> {
    const txt = await this.#getFile(name);
    return ucdParse(txt);
  }

  /**
   * If the file is in the database, and we've checked in the last 30 days,
   * use the local copy.
   * Otherwise, check to see if it's changed.  If not, use the local copy.
   * Otherwise, get a new copy.
   *
   * @param name
   * @returns
   */
  async #getFile(name: string): Promise<string> {
    const u = new URL(name, this.#opts.prefix);
    let file = await this.#db.getFile(name);
    let useLocal = Boolean(file);
    if (file) {
      if (!this.#validDate(file.lastUpdate)) {
        useLocal = false;
      }
    }

    if (!useLocal) {
      const init: RequestInit = {
      };
      if (file?.date) {
        init.headers = {'if-modified-since': file.date};
      }
      if (this.#opts.alwaysCheck) {
        init.cache = 'no-cache';
      }
      this.#verbose('Checking "%s"', u);
      const res = await fetch(u, init);
      file = {
        etag: res.headers.get('etag') ?? '---000---',
        date: res.headers.get('last-modified') ?? new Date().toUTCString(),
      };

      if (res.status === 304) {
        await this.#db.setFile(name, file);
        return this.#getLocal(name);
      }

      if (res.status === 200) {
        const txt = await res.text();
        await this.#setLocal(name, txt);
        await this.#db.setFile(name, file);
        return txt;
      }

      this.#verbose('Invalid HTTP status: %d', res.status);
    }

    return this.#getLocal(name);
  }

  #fileName(name: string): string {
    return path.join(this.#opts.cacheDir, name);
  }

  #getLocal(name: string): Promise<string> {
    return fs.readFile(this.#fileName(name), 'utf8');
  }

  #setLocal(name: string, text: string): Promise<void> {
    return fs.writeFile(this.#fileName(name), text, 'utf8');
  }

  #validDate(d?: Date): boolean {
    if (this.#opts.alwaysCheck || !d) {
      return false;
    }
    const dt = d.getTime() + this.#opts.validMS;
    return dt > new Date().getTime();
  }

  #verbose(...args: any[]): void {
    if (this.#opts.verbose) {
      console.log(...args);
    }
  }
}
