const chokidar = require('chokidar');

//
// Facility for watching files for changes.
//

class PleaseWatch {
  constructor() {
    this.watchers = [];
  }

  watch(patterns, options, callback) {
    const watcher = chokidar.watch(
      patterns(),
      options
    );

    watcher.on('ready', () => {
      watcher.on('all', (ev, file) => {
        callback(ev, file);
      });
    });

    this.watchers.push({ watcher, patterns, options, callback });
  }

  closeAll() {
    this.watchers.forEach((watcher) => watcher.watcher.close());
  }

  refreshAll() {
    let newWatchers = [];

    this.watchers.forEach((w) => {
      newWatchers.push({ patterns: w.patterns, options: w.options, callback: w.callback });
    });

    this.closeAll();

    newWatchers.forEach((w) => {
      this.watch(w.patterns, w.options, w.callback);
    });
  }
}

module.exports.PleaseWatch = PleaseWatch;
