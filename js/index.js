import init, * as wasm from "../wasm/nukerus_wasm.js";

start();

async function start() {
  await init();
  wasm.greet();
}