#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs/promises';
import {parse} from '../lib/ucd.js';
import path from 'node:path';
import util from 'node:util';

const files = process.argv.slice(2);
if (files.length === 0) {
  files.push('-');
}

for (const f of files.map(g => ((g === '-') ? '/dev/stdin' : g))) {
  const source = path.resolve(process.cwd(), f);
  const text = await fs.readFile(source, 'utf8');

  try {
    const u = parse(text, {
      grammarSource: source,
    });
    for (const fu of u) {
      console.log(util.inspect(fu, {
        depth: Infinity,
        colors: process.stdout.isTTY,
        maxArrayLength: Infinity,
        maxStringLength: Infinity,
      }));
    }
  } catch (e) {
    if (e.format) {
      console.log(e.format([{source, text}]));
    } else {
      throw e;
    }
  }
}

