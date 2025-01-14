// @ts-check

import wasmRaw from '../rust/target/wasm-bindgen-web/nukerus_wasm_bg.wasm';
import * as wasmApi from '../rust/target/wasm-bindgen-web/nukerus_wasm';

export * from '../rust/target/wasm-bindgen-web/nukerus_wasm';

wasmApi.initSync(wasmRaw);
