import init, * as wasm from "./dist/dummy_rustwasm.js";

await init();
wasm.greet();