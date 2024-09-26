ARG ARCHITECTURE=amd64
ARG DOTNET_VERSION=8.0
ARG UBUNTU_NAME=jammy # 22.04
ARG NODE_VERSION=18.20.2 # From dependencies.yml

# Build Jering node web server to RealtimeServer
FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION}-${UBUNTU_NAME}-${ARCHITECTURE} AS jering-build
WORKDIR /src
ARG NODE_VERSION
RUN apt-get update && apt-get --assume-yes install nodejs npm
RUN npm install --global n
RUN n $NODE_VERSION
RUN git clone --branch 7.0.0 https://github.com/JeringTech/Javascript.NodeJS
WORKDIR /src/Javascript.NodeJS
# Listen to more than just requests to localhost
RUN perl -pi -e "s/'localhost', //" src/NodeJS/Javascript/Servers/OutOfProcess/Http/Http11Server.ts
# Do not bind to the dotnet process
RUN perl -pi -e "s/exitWhenParentExits\(parseInt\(args\.parentPid\), true, 1000\);//" src/NodeJS/Javascript/Servers/OutOfProcess/Http/Shared.ts
RUN dotnet build

FROM node:${NODE_VERSION} AS base

# Build RealtimeServer node application
FROM base AS build
WORKDIR /src
COPY ../RealtimeServer .
RUN npm ci
RUN npm run build

# RealtimeServer access from local dotnet process
EXPOSE 5002
# ShareDB access from remote frontend Angular clients
EXPOSE 5003
# RealtimeServer debugging port
EXPOSE 9230

FROM base AS final
WORKDIR /app
ARG MIGRATOR_ENVIRONMENT
LABEL org.opencontainers.image.source=https://github.com/sillsdev/web-xforge
LABEL org.opencontainers.image.description="Scripture Forge Realtime Server"
LABEL org.opencontainers.image.licenses=MIT
COPY ../../SIL.XForge.Scripture/appsettings.json .
COPY ../../SIL.XForge.Scripture/appsettings.${MIGRATOR_ENVIRONMENT}.json .
COPY --from=jering-build /src .
COPY --from=build /src .
RUN chmod +x /app/start.sh
ENTRYPOINT [ "sh", "/app/start.sh" ]
