import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {Buffer} from 'node:buffer';
import {Database} from './db.js';
import type {PathLike} from 'node:fs';
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
}

interface RequiredUCDoptions {
  alwaysCheck: boolean;
  cacheDir: string;
  prefix: string;
  validMS: number;
}

export interface UCDfile extends UCDoptions {
  name: string;
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
      ...options,
      cacheDir: normalizeCacheDir(options.cacheDir),
    };
    this.#db = new Database(path.join(this.#opts.cacheDir, DB_NAME));
  }

  public static async create(options: UCDoptions = {}): Promise<CacheDir> {
    const cd = new CacheDir(options);
    await cd.init();
    return cd;
  }

  public async init(): Promise<void> {
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
    this.#db.init();
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

  public async parse(name: string): Promise<UCDfile> {
    const txt = await this.#getFile(name);
    return ucdParse(txt);
  }

  async #getFile(name: string): Promise<string> {
    const u = new URL(name, this.#opts.prefix);
    const file = await this.#db.getFile(name);
    const init: RequestInit = {
    };
    if (file?.date) {
      init.headers = {'if-modified-since': file.date};
    }
    if (this.#opts.alwaysCheck) {
      init.cache = 'no-cache';
    }
    const res = await fetch(u, init);
    if (res.status === 200) {
      return res.text();
    }
    if (res.status === 304) {
      return this.#getLocal(name);
    }
    throw new Error(`Invalid response code: ${res.status}`);
  }

  async #getLocal(name: string): Promise<string> {
    const cacheFile = path.join(this.#opts.cacheDir, name);
    return fs.readFile(cacheFile, 'utf8');
  }
}
