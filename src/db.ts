import * as fs from 'node:fs/promises';
import {errCode} from './errno.js';

export interface FileState {
  // See: https://bz.apache.org/bugzilla/show_bug.cgi?id=39727
  etag: string; // HTTP etag, with "-gzip" removed
  date: string; // HTTP date
  lastUpdate?: Date; // Last time we checked the server.
}

export interface State {
  lastUpdate: Date;
  files: {
    [key: string]: FileState;
  };
}

export const FIRST_DATE: Date = new Date(1900, 0, 0, 0);

/**
 * The stupidest-possible JSON "database".
 */
export class Database {
  #state: State;
  #file?: string;

  /**
   * @param file full file name, or undefined for memory-only
   */
  public constructor(file?: string) {
    this.#file = file;
    this.#state = {
      lastUpdate: FIRST_DATE,
      files: Object.create(null),
    };
  }

  public get lastUpdate(): Date {
    return this.#state.lastUpdate;
  }

  public get length(): number {
    return Object.keys(this.#state.files).length;
  }

  public get isValid(): boolean {
    return this.#state.lastUpdate !== FIRST_DATE;
  }

  public static async create(file?: string): Promise<Database> {
    const db = new Database(file);
    await db.init();
    return db;
  }

  public async init(): Promise<this> {
    if (this.#file) {
      try {
        const txt = await fs.readFile(this.#file, 'utf8');
        this.#state = JSON.parse(
          txt,
          (k, v) => ((k === 'lastUpdate') ? new Date(v) : v)
        );
        this.#state.lastUpdate ??= FIRST_DATE;
      } catch (e) {
        if (!errCode(e, 'ENOENT')) {
          throw e;
        }
      }
    }
    return this;
  }

  public async setFile(file: string, state: FileState): Promise<void> {
    this.#state.files[file] = {
      ...state,
      lastUpdate: new Date(),
    };
    await this.#write();
  }

  public getFile(name: string): FileState | undefined {
    return this.#state.files[name];
  }

  async #write(): Promise<void> {
    this.#state.lastUpdate = new Date();
    if (this.#file) {
      await fs.writeFile(this.#file, JSON.stringify(this.#state), 'utf8');
    }
  }
}
