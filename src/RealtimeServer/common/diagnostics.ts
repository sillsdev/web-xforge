import fs from 'fs';
import inspector from 'inspector';
import path from 'path';

const secondsToProfile = 5;

// POSIX defines SIGUSR1 and SIGUSR2 as user-defined signals, but SIGUSR1 is reserved by Node.js to start the debugger.
// Send the signal using e.g. kill -USR2 <node process id>
process.on('SIGUSR2', () => {
  console.log('Signal SIGUSR2 received; starting profiling');
  const session = new inspector.Session();
  session.connect();

  session.post('Profiler.enable', () => {
    session.post('Profiler.start', () => {
      console.log('Profiler started');
      setTimeout(() => {
        session.post('Profiler.stop', (err, { profile }) => {
          if (err) throw err;
          console.log('Profiler stopped');
          const filePath = path.join(process.cwd(), 'profile.cpuprofile');
          console.log(`Writing profiler file to ${filePath}`);
          fs.writeFile(filePath, JSON.stringify(profile), err => {
            if (err) throw err;
            console.log('File written');
          });
        });
      }, secondsToProfile * 1000);
    });
  });
});

console.log(`Diagnostics enabled for Node process with pid ${process.pid}`);
