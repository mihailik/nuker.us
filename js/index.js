import wasmRaw from '../rust/target/wasm-bindgen-web/nukerus_wasm_bg.wasm';
import { initSync, greet } from '../rust/target/wasm-bindgen-web/nukerus_wasm';
start();

async function start() {
  console.log('wasmRaw ', wasmRaw);
  const wasm = await initSync(wasmRaw);

  console.log({ wasm });

  greet();
}