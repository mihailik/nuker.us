// @ts-check

import wasmRaw from '../rust/target/wasm-bindgen-web/nukerus_wasm_bg.wasm';
import { initSync, greet } from '../rust/target/wasm-bindgen-web/nukerus_wasm';

export * from '../rust/target/wasm-bindgen-web/nukerus_wasm';

const wasmOut = initSync(wasmRaw);

console.log({ wasmOut, initSync, greet });