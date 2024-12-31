// @ts-check

import * as wasm from './rust';
import { firehoseWebSocket } from './firehose-ws';
import { firehose } from './firehose-coldsky';

runOnce();

const btn = document.createElement('button');
btn.textContent = 'more...';
btn.onclick = () => {
  runOnce();
};
document.body.appendChild(btn);

const btnWs = document.createElement('button');
btnWs.textContent = 'web socket';
btnWs.onclick = async () => {
  const LISTEN_TIME = 10000;
  const stopListening = Date.now() + LISTEN_TIME;

  const outPre = document.createElement('pre');
  outPre.textContent = 'Listening...';
  document.body.appendChild(outPre);

  let count = 0;
  let allStart = 0;
  let allTime = 0;
  let logObj = {};
  for await (const messages of firehoseWebSocket()) {
    if (!allStart) allStart = Date.now();

    if (Date.now() > stopListening) {
      break;
    }

    count += messages.length;

    // console.log(messages);

    let sizes = new Uint32Array(messages.length);
    let timestampOffsets = new Uint32Array(messages.length);
    let totalSize = 0;
    for (let i = 0; i < messages.length; i++) {
      totalSize += sizes[i] = messages[i].data.byteLength;
    }

    let buffer = new Uint8Array(totalSize);
    let offset = 0;
    let timestampStart = messages[0].receiveTimestamp;
    for (let i = 0; i < messages.length; i++) {
      buffer.set(new Uint8Array(messages[i].data), offset);
      timestampOffsets[i] = messages[i].receiveTimestamp - timestampStart;
      offset += sizes[i];
    }

    //console.log('wasm.process_record_list ', buffer, sizes);
    const chunkStart = Date.now();
    const msgRes = wasm.process_record_list(
      buffer,
      sizes,
      timestampStart,
      timestampOffsets
    );
    const chunkTime = Date.now() - chunkStart;
    allTime += chunkTime;

    outPre.textContent = JSON.stringify(logObj = {
      count,
      increment: messages.length,
      time: Date.now() - allStart,
      parseTime: chunkTime,
      allParseTime: allTime,
      perMessage: chunkTime / messages.length,
      perMessageTotal: allTime / count,
      receiveTimestamp: messages[messages.length - 1].receiveTimestamp,
      data: {
        byteLength: messages[messages.length - 1].data.byteLength,
        parsed: msgRes
      }
    }, null, 2);

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const coldskyAllStart = Date.now();
  let coldskyAllParseTime = 0;
  let coldskyCount = 0;
  const stopListeningColdsky = Date.now() + LISTEN_TIME;
  for await (const chunk of firehose()) {
    coldskyAllParseTime += chunk.parseTime;
    coldskyCount +=
      (chunk.messages?.length || 0) +
      (chunk.deletes?.length || 0) +
      (chunk.unexpected?.length || 0);
    
    outPre.textContent = JSON.stringify(logObj = {
      ...logObj,
      coldskyCount,
      coldskyAllParseTime,
      coldskyTime: Date.now() - coldskyAllStart,
      coldskyPerMessage: coldskyAllParseTime / coldskyCount,
    }, null, 2);

    if (Date.now() > stopListeningColdsky) break;
  }

  const finishElem = document.createElement('div');
  finishElem.textContent = `Finished ${count} in ${Date.now() - allStart}ms`;
  outPre.appendChild(finishElem);
};
document.body.appendChild(btnWs);

function runOnce() {
  const arg = Math.floor((Math.random() * 200)) - 10;
  const start = Date.now();
  const value = wasm.greet(arg);
  const time = Date.now() - start;

  const valueElem = document.createElement('pre');
  valueElem.textContent = value;
  const tmElem = document.createElement('span');
  tmElem.textContent = time + 'ms';
  tmElem.style.cssText = 'font-size: 80%; padding-left: 1em; opacity: 0.6';
  valueElem.appendChild(tmElem);
  document.body.appendChild(valueElem);
}