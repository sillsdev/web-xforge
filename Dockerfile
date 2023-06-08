ARG NODE_VERSION=16.15.0
ARG DOTNET_VERSION=6.0
ARG UBUNTU_VERSION=22.04
ARG UBUNTU_NAME=jammy

FROM amd64/ubuntu:$UBUNTU_NAME AS build
SHELL ["/bin/bash", "-c"]

ARG DOTNET_VERSION
ARG NODE_VERSION
ENV NVM_DIR=/root/.nvm


COPY src /app
WORKDIR /app/SIL.XForge.Scripture

RUN apt-get update && \
  apt-get install -y \
  mercurial \
  curl \
  dotnet-sdk-$DOTNET_VERSION \
  gcc g++ make \
  && rm -rf /var/lib/apt/lists/* \
  && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
RUN source $NVM_DIR/nvm.sh \
  && nvm install $NODE_VERSION \
  && nvm alias default $NODE_VERSION \
  && nvm use default

RUN chown -R $(whoami) /app \
  && dotnet restore \
  && dotnet build -c Release -o /app/build \
  && dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS final
WORKDIR /app

RUN apt-get update && \
  apt-get install -y \
  mercurial

RUN mkdir -p /var/lib/scriptureforge/sync \
  && mkdir -p /var/lib/scriptureforge/audio \
  && mkdir -p  ~/.local/share/Paratext92 \
  && echo '<?xml version="1.0" encoding="utf-8"?>\
  <InternetSettingsMemento>\
  <SelectedServer>Development</SelectedServer>\
  <PermittedInternetUse>Enabled</PermittedInternetUse>\
  <ProxyPort>0</ProxyPort>\
  </InternetSettingsMemento>' > ~/.local/share/Paratext92/InternetSettings.xml

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "SIL.XForge.Scripture.dll"]
