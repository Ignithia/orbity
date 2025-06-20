import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";

export default defineConfig([
  {
    input: "src/orbity.js",
    output: [
      {
        file: "dist/orbity.esm.js",
        format: "esm",
        sourcemap: true,
      },
      {
        file: "dist/orbity.cjs.js",
        format: "cjs",
        sourcemap: true,
        exports: "auto",
      },
    ],
    plugins: [typescript({ tsconfig: "./tsconfig.json" })],
    external: [],
  },
  {
    input: "src/orbity.js",
    output: {
      file: "dist/orbity.min.js",
      format: "umd",
      name: "Orbity",
      sourcemap: true,
    },
    plugins: [resolve(), commonjs(), terser()],
  },
]);
