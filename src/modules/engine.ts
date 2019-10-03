// Simple wrapper around 'ws' and '@clusterws/cws' to make functionality similar
// and add ability to switch between 2 different engines
//
// TODO: handle custom ping handler in client
// TODO: add proper types

const PING: any = new Uint8Array(['9'.charCodeAt(0)]).buffer;
function noop(): void { /** ignore */ }

export class WebsocketEngine {
  private engineImport: any;

  constructor(private engine: string) {
    this.engineImport = require(this.engine);
  }

  public createClient(url: string): any {
    if (this.engine === 'ws') {
      const socket: any = new this.engineImport(url);
      return socket;
    }
    return new this.engineImport.WebSocket(url);
  }

  public createServer(options: any, cb?: any): any {
    if (this.engine === 'ws') {
      const wsServer: any = new this.engineImport.Server(options, cb);
      wsServer.__on = wsServer.on.bind(wsServer);
      wsServer.__onConnection = noop;

      wsServer.on = function on(event: string, listener: any): void {
        if (event === 'connection') {
          return wsServer.__onConnection = listener;
        }
        wsServer.__on(event, listener);
      };

      wsServer.__on('connection', function onConnection(socket: any, req: any): void {
        socket.__on = socket.on.bind(socket);
        socket.__onPong = noop;
        socket.__onMessage = noop;
        socket.isAlive = true;

        socket.on = function socketOn(event: string, listener: any): void {
          if (event === 'pong') {
            return socket.__onPong = listener;
          }

          if (event === 'message') {
            return socket.__onMessage = listener;
          }

          socket.__on(event, listener);
        };

        socket.__on('message', function onMessage(msg: any): void {
          socket.isAlive = true;
          if (msg.length === 1 && msg[0] === 65) {
            return socket.__onPong();
          }
          socket.__onMessage(msg);
        });

        socket.__on('pong', function onPong(): void {
          socket.isAlive = true;
          socket.__onPong();
        });

        wsServer.__onConnection(socket, req);
      });

      wsServer.startAutoPing = function autoPing(interval: number, appLevel: boolean): void {
        wsServer.clients.forEach(function each(ws: any): void {
          if (ws.isAlive === false) {
            return ws.terminate();
          }

          ws.isAlive = false;

          if (appLevel) {
            return ws.send(PING);
          }

          ws.ping(noop);
        });

        setTimeout(() => autoPing(interval, appLevel), interval);
      };

      return wsServer;
    }

    return new this.engineImport.WebSocketServer(options, cb);
  }
}