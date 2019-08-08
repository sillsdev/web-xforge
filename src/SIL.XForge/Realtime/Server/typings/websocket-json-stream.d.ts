declare module 'websocket-json-stream' {
  import * as stream from 'stream';

  class WebSocketJSONStream extends stream.Duplex {
    constructor(ws: WebSocket);

    ws: WebSocket;
  }

  namespace WebSocketJSONStream {}

  export = WebSocketJSONStream;
}
