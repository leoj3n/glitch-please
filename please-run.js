const { spawn } = require('child_process');

//
// Facility for running one command at a time.
//

class PleaseRun {
  constructor() {
    // Maintains state.
    this.SCHEDULE_TIMEOUT;
    this.RUN_COUNT = 0;
  }

  // Runs a command, and keeps track of when it finishes.
  run (cmd, args, dir) {
    const proc = spawn(cmd, args, { cwd: dir });
    this.RUN_COUNT++;
    console.log(`${cmd} process spawned`);
    proc.on('close', (code) => {
      this.RUN_COUNT--;
      console.log(`${cmd} exited with code ${code}`);
    });
    return proc;
  };

  // Schedules a callback to run when it has not been interrupted for a wait, and
  // when nothing else is running, then the latest callback will be called once.
  scheduleRun (callback, wait = 2000) {
    clearTimeout(this.SCHEDULE_TIMEOUT); // interrupt

    const check = (initial) => {
      if (initial) {
        this.SCHEDULE_TIMEOUT = setTimeout(check, wait, false);
      } else if (this.RUN_COUNT > 0) {
        this.SCHEDULE_TIMEOUT = setTimeout(check, 20, false);
      } else {
        callback();
      }
    };

    check(true);
  };
}

exports.PleaseRun = PleaseRun;
