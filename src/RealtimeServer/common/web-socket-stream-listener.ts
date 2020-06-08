import express = require('express');
import * as http from 'http';
import { JwtHeader, SigningKeyCallback, verify } from 'jsonwebtoken';
import jwks = require('jwks-rsa');
import ShareDB = require('sharedb');
import WebSocketJSONStream = require('websocket-json-stream');
import ws = require('ws');
import { ExceptionReporter } from './exception-reporter';

function isLocalRequest(request: http.IncomingMessage): boolean {
  const addr = request.connection.remoteAddress;
  return addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' || addr === '::1';
}

export class WebSocketStreamListener {
  private readonly httpServer: http.Server;
  private readonly jwksClient: jwks.JwksClient;

  constructor(
    private readonly audience: string,
    private readonly scope: string,
    authority: string,
    private readonly port: number,
    private exceptionReporter: ExceptionReporter
  ) {
    // Create web servers to serve files and listen to WebSocket connections
    const app = express();
    app.use(express.static('static'));
    app.use((err: any, req: any, res: any, next: any) => {
      console.error(err);
      res.status(500).send('500 Internal Server Error');
      this.exceptionReporter.report(err);
    });
    this.httpServer = http.createServer(app);

    this.jwksClient = jwks({
      cache: true,
      jwksUri: `${authority}.well-known/jwks.json`
    });
  }

  listen(backend: ShareDB): void {
    // Connect any incoming WebSocket connection to ShareDB
    const wss = new ws.Server({
      server: this.httpServer
    });

    wss.on('connection', (webSocket: WebSocket, req: http.IncomingMessage) => {
      this.verifyToken(req, (res: boolean, code: number = 200, message?: string) => {
        if (res) {
          const stream = new WebSocketJSONStream(webSocket);
          backend.listen(stream, req);
        } else {
          webSocket.close(4000 + code, message);
        }
      });
    });
  }

  start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.httpServer.once('error', err => {
        console.error(err);
        this.exceptionReporter.report(err);
        reject(err);
      });
      this.httpServer.once('listening', () => resolve());
      this.httpServer.listen(this.port);
    });
  }

  stop(): void {
    this.httpServer.close();
  }

  private verifyToken(req: http.IncomingMessage, done: (res: boolean, code?: number, message?: string) => void): void {
    const url = req.url;
    if (url != null && url.includes('?access_token=')) {
      // the url contains an access token
      const token = url.split('?access_token=')[1];
      verify(
        token,
        (header, verifyDone) => this.getKey(header, verifyDone),
        { audience: this.audience },
        (err, decoded: any) => {
          if (err) {
            // unable to verify access token
            done(false, 401, 'Unauthorized');
          } else {
            // check that the access token was granted xForge API scope
            const scopeClaim = decoded['scope'];
            if (scopeClaim != null && scopeClaim.split(' ').includes(this.scope)) {
              (req as any).user = decoded;
              done(true);
            } else {
              done(false, 401, 'A required scope has not been granted.');
            }
          }
        }
      );
    } else if (isLocalRequest(req)) {
      // no access token, but the request is local, so it is allowed
      done(true);
    } else {
      // no access token and not local, so it is unauthorized
      done(false, 401, 'Unauthorized');
    }
  }

  private getKey(header: JwtHeader, done: SigningKeyCallback): void {
    if (header.kid == null) {
      done('No key ID.');
      return;
    }
    this.jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) {
        done(err);
      } else {
        const certKey = key as jwks.CertSigningKey;
        const rsaKey = key as jwks.RsaSigningKey;
        const signingKey = certKey.publicKey || rsaKey.rsaPublicKey;
        done(null, signingKey);
      }
    });
  }
}
