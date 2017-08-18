const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const socketio = require('socket.io');
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
    return require(path.join(this.appPath, 'package.json'));
  }

  get installPatterns() {
    return this._installPatterns(this.appPackageJSON);
  }
  set installPatterns(func) {
    this._installPatterns = func;
  }

  get buildPatterns() {
    return this._buildPatterns(this.appPackageJSON);
  }
  set buildPatterns(func) {
    this._buildPatterns = func;
  }

  get distDirectory() {
    return this._distDirectory(this.appPackageJSON);
  }
  set distDirectory(func) {
    this._distDirectory = func;
  }

  get distRoute() {
    return this._distRoute(this.appPackageJSON);
  }
  set distRoute(func) {
    this._distRoute = func;
  }

  get distPath() {
    return path.join(this.appPath, this.distDirectory);
  }

  get watchPatterns() {
    return this.installPatterns.concat(this.buildPatterns);
  }

  constructor({
    appPath = 'app',
    installedDirectory = ['node_modules'],
    installPatterns = () => ['package.json'],
    buildCommand = { cmd: 'npm', args: ['run', 'build'] },
    buildPatterns = () => ['*.html', 'images', 'scripts', 'styles'],
    distIndex = 'index.html',
    distDirectory = () => 'dist',
    distRoute = () => '/dist',
  } = {}) {
    this.server = new PleaseServe();
    this.runner = new PleaseRun();

    this.appPath = appPath;
    this.appPackage = path.join(this.appPath, 'package.json');

    this.installedDirectory = installedDirectory;
    this.installPatterns = installPatterns;
    this.buildCommand = buildCommand;
    this.buildPatterns = buildPatterns;
    this.distIndex = distIndex;
    this.distDirectory = distDirectory;
    this.distRoute = distRoute;

    this.watcher = chokidar.watch(this.watchPatterns, { cwd: this.appPath, ignoreInitial: true });
    this.io = socketio(this.server.server);
  }

  runEmitReload(cmd, args, dir) {
    // Runs the passed command, emitting command/stdout/stderr.
    // Triggers the server to reload clients upon finishing.

    var proc = this.runner.run(cmd, args, dir);

    this.io.sockets.emit('command', `${cmd} ${args.join(' ')}`);

    proc.on('close', (code) => {
      this.server.reloadDistAppClients();
    });
    
    proc.stdout.on('data', (data) => {
      this.io.sockets.emit('stdout', data);
      process.stdout.write(`${data}`);
    });

    proc.stderr.on('data', (data) => {
      this.io.sockets.emit('stderr', data);
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
      this.io.sockets.emit('command-error',
                      `Refusing to run "npm run ${task}" while other commands are running...`);
      return; // abort mission
    }

    this.runEmitReload('npm', ['run', task], this.appPath);
  };

  beginCommunication() {
    this.io.on('connection', (socket) => {
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
    });
  }

  beginWatching() {
    this.watcher.on('ready', () => {
      //https://github.com/paulmillr/chokidar/issues/338
      //console.log(`Watching in ${this.appPath}: \n`, this.watcher.getWatched());

      this.watcher.on('all', (ev, file) => {
        if (this.installPatterns.indexOf(file) > -1) {
          // A file has changed in the app that requires npm install.
          this.runner.scheduleRun(() => {
            this.runEmitReload('npm', ['install'], this.appPath)
              .on('close', (code) => {
                delete require.cache[require.resolve(this.appPackage)];
                //console.log(this.appPackageJSON);
                this.server.setDistAppRoute(this.distRoute, this.distPath, this.distIndex);
                this.io.sockets.emit('package-json', this.appPackageJSON);
                this.io.sockets.emit('dist-route', this.distRoute);
                // TODO: Update the files chokidar is watching using unwatch/add.
              });
          }, 3000);
        } else {
          this.runner.scheduleRun(() => {
            this.runEmitReload(this.buildCommand.cmd, this.buildCommand.args, this.appPath);
          }, 1500);
        }
      });
    });
  }

  begin() { 
    //
    // Start the server.
    //

    this.server.setDistAppRoute(this.distRoute, this.distPath, this.distIndex);
    this.server.listen();

    //
    // Start client-server communication.
    //

    this.beginCommunication();

    // 
    // Initialize the app we're going to watch, build, and serve.
    //

    if ( ! fs.existsSync(path.join(this.appPath, ...this.installedDirectory)) ) {
      this.runEmitReload('npm', ['install'], this.appPath);
    }

    //
    // Start watching for changes.
    //

    this.beginWatching();
  }
}

exports.GlitchPlease = GlitchPlease;
