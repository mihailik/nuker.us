import wasmRaw from '../rust/target/wasm-bindgen-web/nukerus_wasm_bg.wasm';
import { initSync, greet } from '../rust/target/wasm-bindgen-web/nukerus_wasm';
start();

async function start() {
  console.log('wasmRaw ', wasmRaw);
  const wasm = await initSync({ module: wasmRaw });

  console.log({ wasm });

  const value = greet((Math.random() * 200) | 0);

  const valueElem = document.createElement('pre');
  valueElem.textContent = value;
  document.body.appendChild(valueElem);

  const btn = document.createElement('button');
  btn.textContent = 'more...';
  btn.onclick = () => {
    const value = greet((Math.random() * 200) | 0);

    const valueElem = document.createElement('pre');
    valueElem.textContent = value;
    document.body.appendChild(valueElem);
  };
  document.body.appendChild(btn);
}