# Scripture Forge Development Container

This directory contains the configuration to use
[VS Code](https://code.visualstudio.com/docs/devcontainers/containers) to run the app in a [dev container](https://containers.dev/).

## What's Included

- **Ubuntu 24.04** base image with .NET 8.0 SDK and Node.js 22
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

1. Log out of localhost SF (or later Clear site data).
2. Stop SF on your host machine, if running.
3. Stop MongoDB on your host machine, if running (Linux: `sudo systemctl disable --now  mongod.service`)
4. Open this repository in VS Code.
5. When prompted, click **Reopen in Container**, or run the command
   **Dev Containers: Reopen in Container** from the command palette.
6. Probably install the recommended extensions when prompted.
7. Wait for the container to build and various post-create setup to complete
   (such as .NET, and npm dependencies).
8. Open a terminal in VS Code and run the following, which will be inside the container. The `sed` commands reduce noise.

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

9. Open `http://localhost:5000` in a browser on your host machine.

VSCode Run and Debug "Attach to frontend" works and hits breakpoints.

VSCode Run and Debug "Attach to backend dotnet" works and hits breakpoints.

Run tests:

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

## Debugging

### .NET Debugging

Use the standard VS Code C# debugger. Create or use a launch configuration
that attaches to the running dotnet process inside the container.

## Notes

- MongoDB data persists across container rebuilds in a named Docker volume.
  To start fresh, remove the `mongo-data` volume.
- The source code is bind-mounted, so edits in VS Code are immediately
  reflected inside the container and vice versa.
- The container runs as a non-root `vscode` user. Use `sudo` if you need
  elevated permissions.
