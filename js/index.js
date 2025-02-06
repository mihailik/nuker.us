// @ts-check

import wasmRaw from '../rust/target/wasm-bindgen-web/nukerus_wasm_bg.wasm';
import { initSync, greet,start_websocket } from '../rust/target/wasm-bindgen-web/nukerus_wasm';

start();

async function start() {
  console.log('wasmRaw ', wasmRaw);
  const wasm = await initSync({ module: wasmRaw });

  console.log({ wasm });

  runOnce();

  const btn = document.createElement('button');
  btn.textContent = 'more...';
  btn.onclick = () => {
    runOnce();
  };
  document.body.appendChild(btn);

  const btn2 = document.createElement('button');
  btn2.textContent = 'web socket';
  btn2.onclick = async () => {
    const start = Date.now();
    const valuePromise = start_websocket();
    const value = await valuePromise;
    const time = Date.now() - start;

    console.log({ value, valuePromise });

    const valueElem = document.createElement('pre');
    valueElem.textContent = String(value);
    const tmElem = document.createElement('span');
    tmElem.textContent = time + 'ms';
    tmElem.style.cssText = 'font-size: 80%; padding-left: 1em; opacity: 0.6';
    valueElem.appendChild(tmElem);
    document.body.appendChild(valueElem);
    
  };
  document.body.appendChild(btn2);

  function runOnce() {
    const arg = Math.floor((Math.random() * 200)) - 10;
    const start = Date.now();
    const value = greet(arg);
    const time = Date.now() - start;

    const valueElem = document.createElement('pre');
    valueElem.textContent = value;
    const tmElem = document.createElement('span');
    tmElem.textContent = time + 'ms';
    tmElem.style.cssText = 'font-size: 80%; padding-left: 1em; opacity: 0.6';
    valueElem.appendChild(tmElem);
    document.body.appendChild(valueElem);
  }

}