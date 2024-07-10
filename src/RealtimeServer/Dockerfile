ARG ARCHITECTURE=amd64
ARG DOTNET_VERSION=8.0
ARG UBUNTU_NAME=jammy # 22.04

FROM node:18.20.2 as base

FROM base as build
WORKDIR /src
COPY . .
RUN npm ci
RUN npm run build

FROM base AS final
WORKDIR /app
COPY --from=build /src .
ENTRYPOINT ["dotnet", "SIL.XForge.Scripture.dll", "--start-ng-serve=none", "--node-options=--inspect=0.0.0.0:9230"]
