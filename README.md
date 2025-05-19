# @cto.af/ucd

Download, cache, and parse files from the Unicode Character Database (UCD).

## Installation

```sh
npm install @cto.af/ucd
```

## API

Full [API documentation](http://cto-af.github.io/ucd/) is available.

Example:

```js
import {UCD} from '@cto.af/ucd';
const cd = await UCD.create({cacheDir: 'my_ucd_cache_directory'});
const scripts = await cd.parse('Scripts.txt');

for (const {fields} of scripts.parsed.entries) {
  console.log(fields[0]);
}
```

---
[![Build Status](https://github.com/cto-af/ucd/actions/workflows/node.js.yml/badge.svg)](https://github.com/cto-af/ucd/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/cto-af/ucd/graph/badge.svg?token=bUormDwvmD)](https://codecov.io/gh/cto-af/ucd)
