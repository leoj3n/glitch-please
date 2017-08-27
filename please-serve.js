const path = require('path');
const http = require('http');
const express = require('express');
const cheerio = require('cheerio');
const socketio = require('socket.io');
const interceptor = require('express-interceptor');
const errorHandler = require('express-error-handler');
const { ReloadRouter } = require('express-route-reload');

//
// Static file server with dynamic routes capable of reloading clients.
//

class PleaseServe {
  constructor() {
    // main app
    this.app = express();
    this.server = http.createServer(this.app);
    this.app.set('port', process.env.PORT || 3000);

    // By default, socket.io creates a route at "/socket.io" on the server to
    // be used on the client: <script src="/socket.io/socket.io.js"></script>
    this.io = socketio(this.server);

    // sub app
    this.distApp = new ReloadingApp(this.server);
    this.distAppRouter = new ReloadRouter();
    this.app.use(this.distAppRouter.handler());

    // for 404 (TODO: Need a better way)
    this.app.use('/reload', express.static(path.dirname(require.resolve('reload'))));
  }

  setDistAppRoute(route, dir, index) {
    const newRouter = express();
    newRouter.use(`${route}`, this.distApp.getApp());
    newRouter.use(`${route}`, express.static(dir, { index: index }) );
    this.distAppRouter.reload([newRouter]);
  }

  reloadDistAppClients() {
    this.distApp.reloadClients();
  }

  use() {
    this.app.use(...arguments);
  }

  listen() {
    this.app.use(errorHandler.httpError(404));
    this.app.use(errorHandler({
      static: {
        '404': '404.html'
      }
    }));

    this.server.listen(this.app.get('port'), () => {
      console.log(`Web server listening on port ${this.app.get('port')}`);
    });
  }
}

class ReloadingApp {
  // Pass in a server with io.
  constructor(server) {
    this.app = express();
    this.server = server;

    this.app.use(interceptor((req, res) => ({
      isInterceptable() {
        return /text\/html/.test(res.get('Content-Type'));
      },
      intercept(body, send) {
        const $document = cheerio.load(body);
        $document('body').append(`
          <script src="/socket.io/socket.io.js"></script>
          <script>
            socket.on('reload-clients', function () {
              window.location.reload(true)
            });
          </script>
        `);
        send($document.html());
      }
    })));
  }

  reloadClients() {
    this.server.io.emit('reload-clients');
  }

  getApp() {
    return this.app;
  }
}

exports.PleaseServe = PleaseServe;
exports.ReloadingApp = ReloadingApp;
