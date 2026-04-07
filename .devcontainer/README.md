# Scripture Forge Development Container

This directory contains the configuration to use
[VS Code](https://code.visualstudio.com/docs/devcontainers/containers) to run the app in a [dev container](https://containers.dev/).

## What's Included

- **Ubuntu 24.04** base image with .NET 10.0 SDK and Node.js 22
- **MongoDB 8.0** running as a companion container
- System dependencies (ffmpeg, mercurial) pre-installed
- Paratext directories and configuration pre-created
- VS Code extensions for C#, Angular, and other tools pre-configured

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine on Linux)
- [VS Code](https://code.visualstudio.com/) with the
  [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- .NET user secrets configured on your host machine

## Getting Started

1. Log out of localhost SF to not confuse your browser (or later Clear site data in browser dev tools).
2. Stop the SF `dotnet` process on your host machine, if running.
3. Stop MongoDB on your host machine, if running:
   - Linux: `sudo systemctl stop mongod.service`
   - Windows: `sc stop mongodb`
4. Open the devcontainer using your tools. For VS Code:
   1. Open this repository in VS Code.
   2. When prompted, click **Reopen in Container**, or run the command
      **Dev Containers: Reopen in Container** from the command palette.
   3. Probably install the recommended extensions when prompted.
5. Wait for the container to build and various post-create setup processes to complete
   (such as .NET, and npm dependencies).
6. Open a terminal in VS Code and run the following, which will be inside the dev container. The optional `sed` commands reduce noise.

   ```bash
   cd /workspaces/web-xforge/src/SIL.XForge.Scripture &&
     dotnet watch run --node-options=--inspect=9230 |
      sed --unbuffered '/^\[[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}/d' |
      sed --unbuffered 's/^      //' |
      sed --unbuffered --regexp-extended \
        '/^Start processing HTTP request POST http.*:5002\//d;
         /^Sending HTTP request POST http:.*:5002\//d;
         /^Received HTTP response headers after [0-9.]+ms - 200$/d;
         /^End processing HTTP request after [0-9.]+ms - 200$/d'
   ```

   If you are an AI agent, you might instead want to run

   ```bash
   cd /workspaces/web-xforge/src/SIL.XForge.Scripture &&
     dotnet run --node-options=--inspect=9230
   ```

7. Open `http://localhost:5000` in a browser on your host machine.

## Debug

VSCode Run and Debug "Attach to frontend" works and hits breakpoints.

VSCode Run and Debug "Attach to backend dotnet" works and hits breakpoints.

## Tests

You can run tests:

```bash
cd /workspaces/web-xforge && dotnet test
cd /workspaces/web-xforge/src/SIL.XForge.Scripture/ClientApp && npm run test:headless -- --no-watch
cd /workspaces/web-xforge/src/RealtimeServer && npm run test
```

## Ports

| Port  | Service                |
| ----- | ---------------------- |
| 5000  | SF HTTP Server         |
| 5003  | ShareDB                |
| 9230  | Node.js Debugger       |
| 9988  | Frontend test debugger |
| 27017 | MongoDB                |

## Notes

- MongoDB data persists across container rebuilds in a named Docker volume.
  To start fresh, remove the `mongo-data` volume.
- The source code is bind-mounted, so edits in VS Code are immediately
  reflected inside the container and vice versa.
