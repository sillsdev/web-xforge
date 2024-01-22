#See https://aka.ms/customizecontainer to learn how to customize your debug container and how Visual Studio uses this Dockerfile to build your images for faster debugging.

ARG ARCHITECTURE=amd64
ARG DOTNET_VERSION=8.0
ARG UBUNTU_NAME=jammy # 22.04

FROM mcr.microsoft.com/dotnet/aspnet:$DOTNET_VERSION-$UBUNTU_NAME-$ARCHITECTURE AS base
WORKDIR /app
# Setup Volumes
VOLUME /var/lib/scriptureforge
VOLUME /var/lib/xforge
# Add Ubuntu Mirrors
RUN sed -i 's#htt[p|ps]://archive.ubuntu.com/ubuntu/#mirror://mirrors.ubuntu.com/mirrors.txt#g' /etc/apt/sources.list
# Install Node Repository
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
# Install Dependencies
RUN apt-get install -y \
    ffmpeg \
    libc-dev \
    mercurial \
    nodejs \
    && rm -rf /var/lib/apt/lists/*
# Setup Scripture Forge Paths
RUN ln -s /usr/bin/hg /usr/local/bin/hg \
    && mkdir -p /var/lib/scriptureforge/sync \
    && mkdir -p /var/lib/scriptureforge/audio \
    && mkdir -p /var/lib/xforge/avatars \
    && mkdir -p ~/.local/share/Paratext95 \
    && mkdir -p ~/.local/share/SIL/WritingSystemRepository/3 \
    && echo '<?xml version="1.0" encoding="utf-8"?>\
    <InternetSettingsMemento>\
    <SelectedServer>Development</SelectedServer>\
    <PermittedInternetUse>Enabled</PermittedInternetUse>\
    <ProxyPort>0</ProxyPort>\
    </InternetSettingsMemento>' > ~/.local/share/Paratext95/InternetSettings.xml
EXPOSE 5000
EXPOSE 5003

FROM mcr.microsoft.com/dotnet/sdk:$DOTNET_VERSION-$UBUNTU_NAME-$ARCHITECTURE AS build
ARG configuration=Release
WORKDIR /src
# Add Ubuntu Mirrors
RUN sed -i 's#htt[p|ps]://archive.ubuntu.com/ubuntu/#mirror://mirrors.ubuntu.com/mirrors.txt#g' /etc/apt/sources.list
# Install Node Repository
RUN update-ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
# Install NPM
RUN apt-get install -y \
    nodejs \
    && rm -rf /var/lib/apt/lists/*
# Build the Realtime Server
COPY ../RealtimeServer/ /src/RealtimeServer/
WORKDIR /src/RealtimeServer
RUN npm ci
# Build the Angular Frontend
COPY ../SIL.XForge.Scripture/locales.json /src/SIL.XForge.Scripture/locales.json
COPY ../SIL.XForge.Scripture/version.json /src/SIL.XForge.Scripture/version.json
COPY ../SIL.XForge.Scripture/ClientApp/ /src/SIL.XForge.Scripture/ClientApp/
WORKDIR /src/SIL.XForge.Scripture/ClientApp
RUN npm ci
RUN npm run build
# Build the .NET Backend
COPY ../SIL.XForge/ /src/SIL.XForge/
COPY ../SIL.XForge.Scripture/ /src/SIL.XForge.Scripture/
WORKDIR /src/SIL.XForge.Scripture
RUN dotnet restore SIL.XForge.Scripture.csproj
RUN dotnet build SIL.XForge.Scripture.csproj -c $configuration -o /app/build

FROM build AS publish
ARG configuration=Release
ARG version=9.9.9
ARG AngularConfig=production
WORKDIR /src/SIL.XForge.Scripture
RUN dotnet publish SIL.XForge.Scripture.csproj -c $configuration -o /app/publish /p:UseAppHost=false \
    /p:Version=$version /p:AngularConfig=$AngularConfig /p:RealtimeServerRoot=/src/RealtimeServer/ --no-restore

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "SIL.XForge.Scripture.dll", "--start-ng-serve=none"]
