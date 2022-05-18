FROM node:16.15.0

WORKDIR /usr/src/app

# Add Microsoft package signing key and install .NET SDK and Mercurial
RUN wget https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb \
  && dpkg -i packages-microsoft-prod.deb \
  && rm packages-microsoft-prod.deb \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
  dotnet-sdk-6.0 \
  mercurial \
  && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/hg /usr/local/bin/hg

COPY SIL.XForge ./SIL.XForge
COPY SIL.XForge.Scripture ./SIL.XForge.Scripture
COPY RealtimeServer ./RealtimeServer

WORKDIR /usr/src/app/SIL.XForge.Scripture

# Mark the project as ready for .NET 6
RUN sed -i -e 's/<TargetFramework>netcoreapp3.1<\/TargetFramework>/<TargetFramework>net6.0<\/TargetFramework>/g' SIL.XForge.Scripture.csproj
RUN dotnet build

RUN mkdir -p /var/lib/scriptureforge/audio/

EXPOSE 5000
EXPOSE 5003

CMD ["dotnet", "run"]
