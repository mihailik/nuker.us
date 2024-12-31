// @ts-check

import wasmRaw from '../rust/target/wasm-bindgen-web/nukerus_wasm_opt_bg.wasm';
import { initSync, greet } from '../rust/target/wasm-bindgen-web/nukerus_wasm_opt';

export * from '../rust/target/wasm-bindgen-web/nukerus_wasm_opt';

const wasmOut = initSync(wasmRaw);

console.log({ wasmOut, initSync, greet });