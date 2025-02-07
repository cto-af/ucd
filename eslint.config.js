import es6 from '@cto.af/eslint-config/es6.js';
import ts from '@cto.af/eslint-config/ts.js';

export default [
  {
    ignores: [
      'lib/**',
      'src/ucd.js',
    ],
  },
  ...es6,
  ...ts,
];
