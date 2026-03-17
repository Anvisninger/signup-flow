import { build } from "esbuild";
import { copyFileSync } from "node:fs";

const buildTime = new Date().toISOString();

await build({
  entryPoints: ["packages/auth-flow/src/index.js"],
  bundle: true,
  format: "iife",
  globalName: "AnvisningerAuthFlow",
  outfile: "dist/auth-flow.js",
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
});

// Backward-compatible legacy filename for existing embeds
copyFileSync("dist/auth-flow.js", "dist/signup-flow.js");

console.log("Built auth-flow.js (+ legacy signup-flow.js) at", buildTime);
