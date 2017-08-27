const fs = require('fs');
const path = require('path');
const { PleaseWatch } = require('./please-watch');
const { PleaseRun } = require('./please-run');
const { PleaseServe } = require('./please-serve');

// 
// GlitchPlease: Install/serve/watch/build/repeat for Glitch.com!
//
// Uses passed arguments to initialize a static file server, configure which
// files to watch for changes, and sets up commands to run when there is a
// pause in writes. When a command finishes: events are emitted, clients are
// reloaded, routes are updated, and watch files are reconfigured.
//
class GlitchPlease {
  get appPackageJSON() {
    return require(path.join(this.appRoot, 'package.json'));
  }

  get appIsInstalled() {
    return this._appIsInstalled(this.appRoot);
  }
  set appIsInstalled(func) {
    this._appIsInstalled = func;
  }

  get appInstallPatterns() {
    return ['package.json'].concat(this._appInstallPatterns(this.appPackageJSON));
  }
  set appInstallPatterns(func) {
    this._appInstallPatterns = func;
  }

  get distPath() {
    return this._distPath(this.appRoot, this.appPackageJSON);
  }
  set distPath(func) {
    this._distPath = func;
  }

  get distRoute() {
    return this._distRoute(this.appPackageJSON);
  }
  set distRoute(func) {
    this._distRoute = func;
  }

  constructor({
    appRoot = path.join(process.cwd(), 'kennel'),
    appIsInstalled = (appRoot) => fs.existsSync(path.join(appRoot, 'node_modules')),
    appInstallPatterns = (appPackageJSON) => [],
    distPath = (appRoot, appPackageJSON) => path.join(appRoot, 'dist'),
    distRoute = (appPackageJSON) => '/',
    distIndex = 'index.html',
  } = {}) {
    this.watcher = new PleaseWatch();
    this.server = new PleaseServe();
    this.runner = new PleaseRun();

    this.appRoot = appRoot;
    this.appPackage = path.join(this.appRoot, 'package.json');

    this.appIsInstalled = appIsInstalled;
    this.appInstallPatterns = appInstallPatterns;
    this.distPath = distPath;
    this.distRoute = distRoute;
    this.distIndex = distIndex;
  }

  runEmitReload(cmd, args, dir) {
    // Runs the passed command, emitting command/stdout/stderr.
    // Triggers the server to reload clients upon finishing.

    const proc = this.runner.run(cmd, args, dir);
    const commandString = `${cmd} ${args.join(' ')}`;

    this.server.io.sockets.emit('command', commandString);

    proc.on('error', (err) => {
      this.server.io.sockets.emit('command-error', 'Failed to start process!');
    });

    proc.on('close', (code) => {
      this.server.io.sockets.emit('command-end', commandString);
      this.server.reloadDistAppClients();
    });
    
    proc.stdout.on('data', (data) => {
      this.server.io.sockets.emit('stdout', data);
      process.stdout.write(`${data}`);
    });

    proc.stderr.on('data', (data) => {
      this.server.io.sockets.emit('stderr', data);
      process.stdout.write(`${data}`);
    });

    return proc;
  };

  npmRun(task) {
    // Runs the passed npm task for the app if nothing else is running.
    // TODO: Security concern here. We should make sure the task exists in
    // package.json under scripts and is whitelisted, because I'm not sure what
    // exploits could be made as part of an `npm run <exploit here>` command.

    if (this.runner.RUN_COUNT > 0) {
      this.server.io.sockets.emit('command-error',
                      `Refusing to run "npm run ${task}" while other commands are running...`);
      return; // abort mission
    }

    this.runEmitReload('npm', ['run', task], this.appRoot);
  };

  appWatchRun(watchPatterns, command, wait) {
    this.watcher.watch(
      () => watchPatterns(this.appPackageJSON),
      { cwd: this.appRoot, ignoreInitial: true },
      (ev, file) => {
        this.runner.scheduleRun(() => {
          this.runEmitReload(command.cmd, command.args, this.appRoot);
        }, wait);
      }
    );
  }

  appWatchInstall() {
    this.watcher.watch(
      () => this.appInstallPatterns,
      { cwd: this.appRoot, ignoreInitial: true },
      (ev, file) => {
        this.runner.scheduleRun(() => {
          this.runEmitReload('npm', ['install'], this.appRoot)
            .on('close', (code) => {
              // delete old package configuration
              delete require.cache[require.resolve(this.appPackage)];

              // close and re-open watchers registered with appWatchRun
              this.watcher.refreshAll();

              // change the server route for the app distributable
              this.server.setDistAppRoute(this.distRoute, this.distPath, this.distIndex);

              // emit updated config to any listening consoles
              this.server.io.sockets.emit('package-json', this.appPackageJSON);
              this.server.io.sockets.emit('dist-route', this.distRoute);
            });
        }, 3000);
      }
    );
  }

  socketConnection() {
    this.server.io.on('connection', (socket) => {
      // Handle errors.
      socket.on('error', (err) => {
        console.warn('SocketIO Error: ', err);
      });

      // Tell the connecting client the project domain when running on Glitch.
      if (process.env.PROJECT_DOMAIN) {
        socket.emit('project-domain', process.env.PROJECT_DOMAIN);
      }

      // Tell the connecting client what the app's package.json looks like.
      socket.emit('package-json', this.appPackageJSON);

      // Tell the connecting client what the app's dist route is.
      socket.emit('dist-route', this.distRoute);

      // Accept "tasks" from the client to `npm run` in the app.
      socket.on('npm-run', (data) => {
        this.npmRun(data.task);
      });
      
      // Accept requests to view file contents from client.
      socket.on('request-file', (data) => {
        var loc = path.join(this.appRoot, data.path);
        if (fs.existsSync(loc)) {
          fs.readFile(loc, 'utf8', function(err, theFile) {
            socket.emit('receive-file', theFile);
          });
        } else {
          socket.emit('command-error', `Cannot locate file at path ${loc}`);
        }
      });

      // Accepts file path and contents to write.
      socket.on('write-file', (data) => {
        var loc = path.join(this.appRoot, data.path);
        if (fs.existsSync(loc)) {
          fs.writeFile(loc, data.content, function(err) {
            if (err) {
              socket.emit('command-error', `ERROR: ${err}`);
              return console.log(err);
            }
          }); 
        } else {
          socket.emit('command-error', `Cannot locate file at path ${loc}`);
        }
      });
    });
  }

  startup() { 
    //
    // Start the server.
    //

    this.server.setDistAppRoute(this.distRoute, this.distPath, this.distIndex);
    this.server.listen();

    //
    // Start client-server communication.
    //

    this.socketConnection();

    // 
    // Initialize the app we're going to watch, build, and serve.
    //

    if ( ! this.appIsInstalled ) {
      this.runEmitReload('npm', ['install'], this.appRoot);
    }

    //
    // Start watching for changes.
    //

    this.appWatchInstall();
  }
}

exports.GlitchPlease = GlitchPlease;
