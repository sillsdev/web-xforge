# Running scripts
1. Read the description and any instructions within the script you intend to run.
2. Run `npm install` or `npm ci` in the `db_tools` directory.
3. Check the connection settings in `utils.js`. There are presets for dev, qa, and live. Make sure your SSH config and these settings specify the same port numbers for the same services. See the [setting up ssh config](#setting-up-ssh-config) section later in this file.
4. If connecting to a remote server, run SSH to forward ports from the remote server to the port specified in `utils.js`. If connecting to your local machine, make sure any needed services, such as the realtime server, are running.
5. Depending on which script you are running, you may need to edit it to specify whether to connect to dev, qa, or live, and/or what project or documents to read from.
6. Run the script. On Linux this should be done by running `./script-name` from within the `db_tools` directory.

# Important notes
- As of the time of writing, some of the scripts require npm packages from the Realtime server, rather than the `db_tools` directory, because they were written before npm packages had been added to this directory. Because of this, two scripts that use the same package might not necessarily use the same version of the package.
- As much as possible, package versions in `db_tools` should be kept in sync with the versions used in `src/Realtimeserver` and `src/SIL.XForge.Scripture/ClientApp`.
- If ShareDB has been updated recently, there may be a version mismatch between your local machine and the version used on a production server. This can cause a ShareDB client in one of the scripts to fail to connect to an older ShareDB server. If this problem is encountered, install the version of ShareDB used on the server you're trying to connect to.
- Some scripts require `mongosh`, which is not available for all versions of MongoDB. You might not be able to run the script without updating to a newer version of MongoDB. The `mongosh` command supersedes the `mongo` command, which is slated for removal.

# Setting up ssh config
You should set up your SSH config (`~/.ssh/config`) with presets for port forwarding. For example:
```
Host <name for this config>
  User <your username on the server>
  HostName <the host to connect to>
  LocalForward localhost:<local port number> <host and port number to forward>
```
This can then be run as `ssh <name for this config>`.
Note that `<host and port number to forward>` should be specified from the perspective of the host you are connecting to. So to forward port 3000 on the server to port 3000 on your local machine, the setting would be `LocalForward localhost:3000 localhost:3000`.

It's also recommended to set a default `ServerAliveInterval` that will apply to any connection:
```
Host *
  ServerAliveInterval 60
```
