const path = require('path');
const http = require('http');
const express = require('express');
const cheerio = require('cheerio');
const socketio = require('socket.io');
const interceptor = require('express-interceptor');
const errorHandler = require('express-error-handler');
const { ReloadRouter } = require('express-route-reload');

let used = [];

//
// Static file server with dynamic routes capable of reloading clients.
//

class PleaseServe {
  constructor() {
    // Main app.
    this.app = express();
    this.server = http.createServer(this.app);
    this.app.set('port', process.env.PORT || 3000);

    // By default, socket.io creates a route at "/socket.io" on the server to
    // be used on the client: <script src="/socket.io/socket.io.js"></script>
    this.io = socketio(this.server);

    // Sub app that injects socket.io reload on dynamic route.
    this.distApp = new ReloadingApp();
    this.distAppRouter = new ReloadRouter();
    this.app.use(this.distAppRouter.handler());
  }

  setDistAppRoute(route, dir, index) {
    const newRouter = express();
    // Inject reload on new route.
    newRouter.use(route, this.distApp.getApp());
    newRouter.use(route, express.static(dir, { index: index }) );
    this.distAppRouter.reload([newRouter]);
  }

  reloadDistAppClients() {
    this.io.emit('reload-clients');
  }

  use() {
    this.distApp.addToUsed(arguments[0]);
    this.app.use(...arguments);
  }

  listen() {
    this.app.use(errorHandler.httpError(404));
    this.app.use(errorHandler({
      static: {
        '404': path.join(__dirname, '404.html')
      }
    }));

    this.server.listen(this.app.get('port'), () => {
      console.log(`Web server listening on port ${this.app.get('port')}`);
    });
  }
}

class ReloadingApp {
  // Pass in a server with io.
  constructor() {
    this.app = express();

    this.app.use(interceptor((req, res) => ({
      isInterceptable() {
        // About this temporary "used" hack...  One requirement I am really
        // wanting to fulfill is allowing the consoleApp be configured to '/'
        // while distApp is '/out', as well as allowing the reverse
        // configuration where consoleApp can be configured to '/console-app'
        // while distApp is '/'. If anyone has any ideas of how to allow both
        // of these configurations without a hack like this please file issue.
        console.log('USED LENGTH ', used.length, used, req.originalUrl, res.get('Content-Type'));
        for (let i = 0; i < used.length; i++) {
          if (used[i] === '/') {
            if (req.originalUrl === '/') {
              console.log('used is / and origUrl is /');
              return false;
            }
          } else if (req.originalUrl.startsWith(used[i])) {
            console.log('starts with used');
            return false;
          }
        }
        if (/text\/html/.test(res.get('Content-Type'))) {
          console.log('IS HTML');
        } else {
          console.log('IS NOT HTML');
        }
        return /text\/html/.test(res.get('Content-Type'));
      },
      intercept(body, send) {
        const $document = cheerio.load(body);
        $document('body').append(`
          <script src="/socket.io/socket.io.js"></script>
          <script>
            var socket = io();
            socket.on('reload-clients', function () {
              window.location.reload(true)
            });
          </script>
        `);
        send($document.html());
      }
    })));
  }

  addToUsed(route) {
    used.push(route);
  }

  getApp() {
    return this.app;
  }
}

exports.PleaseServe = PleaseServe;
exports.ReloadingApp = ReloadingApp;
