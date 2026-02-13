import { build } from "esbuild";

const buildTime = new Date().toISOString();

await build({
  entryPoints: ["packages/signup-flow/src/index.js"],
  bundle: true,
  format: "iife",
  globalName: "AnvisningerSignupFlow",
  outfile: "dist/signup-flow.js",
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
});

console.log("Built signup-flow.js at", buildTime);
