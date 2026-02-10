
/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  preset: "ts-jest/presets/default-esm.js",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  globals: {
    "ts-jest": {
      useESM: true
    }
  }
};

export default config;
