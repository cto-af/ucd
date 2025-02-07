export default {
  format: 'es',
  input: 'src/ucd.peggy',
  output: 'src/ucd.js',
  dts: true,
  returnTypes: {
    data_file: 'import("./ucdFile.ts").UCDFile',
  },
};
