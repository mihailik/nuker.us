// @ts-check

export function firehoseWebSocket() {

  const wsAddress = 'wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos';

  let wsClosed = false;
  let wsError;

  const ws = new WebSocket(wsAddress);
  ws.binaryType = 'arraybuffer';
  ws.addEventListener('message', handleMessage);
  ws.addEventListener('error', handleError);
  ws.addEventListener('close', handleClose);

  /** @type {{ receiveTimestamp: number, data: ArrayBuffer }[]} */
  let bufMessages = [];
  let notifyReceived = () => { };
  /** @type {Promise<void>} */
  let notifyReceivedPromise = new Promise(resolve => { notifyReceived = resolve });

  return stream();

  async function* stream() {
    try {
      while (true) {
        if (wsError) throw wsError;
        if (wsClosed) return;

        if (bufMessages?.length) {
          const res = bufMessages;
          bufMessages = [];
          yield res;
        } else {
          await notifyReceivedPromise;
          notifyReceivedPromise = new Promise(resolve => { notifyReceived = resolve });
        }
      }
    } finally {
      ws.close();
    }
  }

  /** @param {MessageEvent<ArrayBuffer>} event */
  function handleMessage(event) {
    if (wsClosed) {
      console.warn('Received message after close ', event, event.data);
      return;
    }
    if (wsError) {
      console.warn('Received message after error ', event, event.data);
      return;
    }

    const receiveTimestamp = Date.now();
    bufMessages.push({ receiveTimestamp, data: event.data });
    notifyReceived();
  }

  function handleClose() {
    wsClosed = true;
    notifyReceived();
  }

  function handleError(error) {
    console.error(error);
    wsError = error.error || error;
    notifyReceived();
  }
}