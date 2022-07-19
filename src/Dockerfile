FROM node:16.15.0

WORKDIR /usr/src/app

# Add Microsoft package signing key and install .NET SDK and Mercurial
RUN wget https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb \
  && dpkg -i packages-microsoft-prod.deb \
  && rm packages-microsoft-prod.deb \
  && apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends \
  dotnet-sdk-6.0 \
  mercurial \
  && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/hg /usr/local/bin/hg
RUN mkdir -p ~/.local/share/Paratext92/
RUN echo '<?xml version="1.0" encoding="utf-8"?>\
  <InternetSettingsMemento>\
  <SelectedServer>Development</SelectedServer>\
  <PermittedInternetUse>Enabled</PermittedInternetUse>\
  <ProxyPort>0</ProxyPort>\
  </InternetSettingsMemento>' > ~/.local/share/Paratext92/InternetSettings.xml

COPY SIL.XForge ./SIL.XForge
COPY SIL.XForge.Scripture ./SIL.XForge.Scripture
COPY RealtimeServer ./RealtimeServer

WORKDIR /usr/src/app/RealtimeServer
RUN npm ci
WORKDIR /usr/src/app/SIL.XForge.Scripture/ClientApp
RUN npm ci
RUN npm run build

WORKDIR /usr/src/app/SIL.XForge.Scripture
RUN dotnet build

RUN mkdir -p /var/lib/scriptureforge/audio/

EXPOSE 5000
EXPOSE 5003

# CMD cd bin/Release/netcoreapp3.1/linux-x64/publish && ./SIL.XForge.Scripture
CMD ["dotnet", "run"]
