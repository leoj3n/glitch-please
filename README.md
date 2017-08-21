# Glitch, Please!

This package was created to enhance both expreince and productivity while
hacking on [Glitch](https://glitch.com/) and localhost projects that employ
build commmands to generate a distrubitable.

It does this by providing a special server that is capable of watching for file
changes, running build commands, emitting IO events, and refreshing connected
clients as needed.

## Quick Start

To use the module, instantiate a new `GlitchPlease` instance in `server.js`:

```js
const welcomeApp = require('./welcome'); // should export an express app
const { GlitchPlease } = require('glitch-please');
const path = require('path');
const fs = require('fs');

const please = new GlitchPlease({
  appRoot: path.join(__dirname, 'myapp'),
  appIsInstalled (appRoot) {
    return fs.existsSync(path.join(appRoot, 'myInstallArtifact'));
  },
  distPath (appRoot, appPackageJSON) {
    if (appPackageJSON['myconfig'].hasOwnProperty('custom_dist')) {
      return path.join(appRoot, appPackageJSON['myconfig']['custom_dist']);
    } else {
      return path.join(appRoot, 'dist');
    }
  },
  distRoute (appPackageJSON) {
    if (appPackageJSON['myconfig'].hasOwnProperty('custom_dist')) {
      return '/' + appPackageJSON['myconfig']['custom_dist'];
    } else {
      return '/dist';
    }
  }
});

please.appWatchRun(function(appPackageJSON) {
  return ['scripts', 'styles', 'images', appPackageJSON['main']];
}, { cmd: 'grunt', args: ['jshint', 'dist'] }, 2000);

please.server.use('/', welcomeApp);
please.startup();
```

### Use with Glitch.com

This module handles reloading connected clients, so if you plan to use it with
Glitch, uncheck the "Refresh App on Changes" option in Glitch user settings:

![image](https://user-images.githubusercontent.com/990216/28885818-cc53141c-777c-11e7-942f-83bb4b893ada.png)

You should also create a new file in the root of your app named
[watch.json](https://glitch.com/faq#restart), with contents like:

```json
{
  "install": {
    "include": [
      "^package\\.json$"
    ]
  },
  "restart": {
    "include": [
      "^server\\.js$"
    ]
  },
  "throttle": 100
}
```

Where `server.js` is the file that instantiates a `GlitchPlease` instance, and
`package.json` contains the `glitch-please` dependency.

Most likely your app will be in a subdirectory (`./app` by default), and will
have its own `package.json`, while the `package.json` with the `glitch-please`
dependency will be in the root, the directory above `./app`.

See <https://github.com/fidojs/fidojs-kennel> for a working example.

## Configuration

### `appRoot`: Path to app root.

`appRoot` should be set to a string name of the directory containing the app to
be built. It is expected that the app directory contains a `package.json`.

Defaults to `./app`, relative to where the node process was started from.

This setting is used for:

- Getting `package.json` configuration of the app.
- Checking if the app is installed.
- Running `npm` and build commands.
- Watching files for changes.
- Setting the distributable path.

Example:

```js
const { GlitchPlease } = require('glitch-please');
const path = require('path');

const please = new GlitchPlease({
  appRoot: path.join(__dirname, 'myapp'),
  ...
});

please.startup();
```

### `appIsInstalled`: Checks if app has been installed yet.

`appIsInstalled` should be set to a function that returns `true` or `false`,
depending on if the app install has run at least once before.

This is used to determine if `npm install` should be run for the first time on
startup. This is useful for doing an initial build in a fresh clone, or a new
remix, without having to manually edit a file just to trigger a first build.

Defaults to simply checking if `node_modules` exists in the app directory.

Example:

```js
const { GlitchPlease } = require('glitch-please');
const path = require('path');

const please = new GlitchPlease({
  ...
  appIsInstalled (appRoot) {
    return fs.existsSync(path.join(appRoot, 'myInstallArtifact'));
  },
  ...
});

please.startup();
```

### `installPatterns`: Files to watch for `npm install`.

The `package.json` of the app is always watched for changes, and triggers an
`npm install` in the app directory. `installPatterns` enables registering
additional files that should trigger an `npm install`.

`installPatterns` should be set a function to that retuns an array of glob
patterns; matching files will be watched in addition to `package.json`. 

Defaults to an empty array (only `package.json` will trigger `npm install`).

For example, you could add additional patterns to watch for like so:

```js
const { GlitchPlease } = require('glitch-please');

const please = new GlitchPlease({
  ...
  installPatterns (appPackageJSON) {
    return ['bower.json', './config/*.json', 'install-script.sh', appPackageJSON['customPattern']];
  },
  ...
});

please.startup();
```

Changes to any matching file will trigger an `npm install` in the app directory.

### `distIndex`: Index of the distributable.

`distIndex` should be set to a string name of the file that should be served
when navigating a web browser to the root `/` of the app distributable route.

Defaults to `index.html`.

Example:


```js
const { GlitchPlease } = require('glitch-please');

const please = new GlitchPlease({
  ...
  distIndex: 'myapp.html'
  ...
});

please.startup();
```

### `distPath`: Directory distributable is built to.

`distPath` should be set to a function that returns the file path string of the
dist directory.

Defaults to `./dist` relative to where the node process was started from.

Example:

```js
const { GlitchPlease } = require('glitch-please');
const path = require('path');

const please = new GlitchPlease({
  ...
  distPath (appRoot, appPackageJSON) {
    if (appPackageJSON['myconfig'].hasOwnProperty('custom_dist')) {
      return path.join(appRoot, appPackageJSON['myconfig']['custom_dist']);
    } else {
      return path.join(appRoot, 'dist');
    }
  },
  ...
});

please.startup();
```

### `distRoute`: Route for serving distributable.

`distRoute` should be set to a function that returns a string starting with `/`
to be used as route for the web server. This route will be wired up to the
`distPath`, and set to display the `distIndex` if no file is specified.

Defaults to `/`, which is `<app-domain>.glitch.me/` or `localhost:3000/`.

You might want to change this to match the distributable directory, so that an
adjunct logger or welcome app can live on `/` and be the first thing to load.

Example:

```js
const welcomeApp = require('./welcome');
const { GlitchPlease } = require('glitch-please');

const please = new GlitchPlease({
  ...
  distRoute (appPackageJSON) {
    if (appPackageJSON['myconfig'].hasOwnProperty('dest')) {
      return '/' + appPackageJSON['myconfig']['custom_dist'];
    } else {
      return '/dist';
    }
  }
});

please.server.use('/', welcomeApp); // now welcomeApp is served from the root
please.startup();
```

This tells the express server to use the welcome "sub app" for requests to `/`,
and the distributable for requests to `/dist`. Other routes will trigger a 404.

### `appWatchRun`: Add files to watch and commands to run.

So far in this README, you may have noticed a lack of specifying build
commands, and respective conditions under which to run those commands.

`appWatchRun` is a method that can be called to bind a command for running when
certain app files are modified and not changed for a wait period.

Can be called multiple times to bind multiple different commands.

The `appWatchRun` function will accept three parameters:

- A callback function that returns an array of watch patterns.
- An object specifying the command and arguments.
- [optional] Wait time before running (default: 2000).

Example:

```js
const { GlitchPlease } = require('glitch-please');

const please = new GlitchPlease({
  ...
});

please.appWatchRun(function(appPackageJSON) {
  return ['scripts', 'styles', 'images', appPackageJSON['main']];
}, { cmd: 'grunt', args: ['jshint', 'dist'] }, 2000);

please.startup();
```

If you register multiple `appWatchRun`s, be aware that one call can subsume
another. For instance, when using `appWatchRun` for two separate commands:

```js
const { GlitchPlease } = require('glitch-please');

const please = new GlitchPlease({
  ...
});

please.appWatchRun(function(appPackageJSON) {
  return ['scripts', appPackageJSON['main']];
}, { cmd: 'grunt', args: ['jshint', 'scripts'] }, 2000);

please.appWatchRun(function(appPackageJSON) {
  return ['styles', 'images'];
}, { cmd: 'grunt', args: ['sass', 'imagemin'] }, 2000);

please.startup();
```

One could subsume the other. For instance, if you added some images within two
seconds of modifying a script file, then the `grunt sass imagemin` command
might subsume the first `grunt jshit scripts` command (or vice versa). This is
because only one callback is allowed to be in queue awaiting to run at a time.

If a new command comes in while another is still in the process of running,
that command will be queued to run immediately after the current is finished,
unless it is subsumed by another command that requests to run before then.

If you are likely to have one command trigger in the same time span as another,
either combine those into one command, or greatly reduce the `2000` wait time.

## Socket.io Events

Events the server emits and listens for.

### Emit events

Emits over socket.io:

- `stdout`: Standard out from the currently running command.
- `stderr`: Standard error from the currently running command.
- `command`: The command string about to run.
- `command-error`: An error string explaining why a command refused to run.
- `project-domain`: The domain of the Glitch project. Not emitted on localhost.
- `package-json`: JSON from `package.json` of the configured app (use this to
  get at app configuration such as the available npm scripts).
- `dist-route`: Web server path to the distributable of the configured app.

### Listen events

Listens over socket.io:

- `connection`: When a cliet first connects, emits `project-domain`,
  `package-json`, and `dist-route`.
- `npm-run`: When received, will try to run the corresponding npm task; emits
  `command-error` if busy.

### Usage

These events can be useful for building an adjunct logger and/or command runner app.

See <https://www.npmjs.com/package/@fidojs/fidojs-kennel-console> for an example:

[![image](https://user-images.githubusercontent.com/990216/29514817-81145738-862f-11e7-8955-926b783fed51.png)](https://www.npmjs.com/package/@fidojs/fidojs-kennel-console)
