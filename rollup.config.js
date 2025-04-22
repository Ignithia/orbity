import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "rollup-plugin-terser";

export default {
  input: "src/orbity.js",
  output: {
    file: "dist/orbity.min.js",
    format: "umd",
    name: "Orbity",
    sourcemap: true,
  },
  plugins: [
    resolve(),
    commonjs(),
    terser(), // Minifies the bundle
  ],
};
