# Development container for Scripture Forge.
# Based on Ubuntu 24.04 with .NET 8.0 SDK and Node.js 22.
ARG DOTNET_VERSION=8.0
ARG UBUNTU_NAME=noble

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION}-${UBUNTU_NAME}-amd64

ARG NODE_MAJOR=22

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js repository and system dependencies required by Scripture Forge
RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        curl \
        git \
        procps \
        sudo \
        wget \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install --yes --no-install-recommends \
        build-essential \
        ffmpeg \
        libc-dev \
        mercurial \
        nodejs \
    && curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg \
      https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg \
    && curl -fsSLo /etc/apt/sources.list.d/brave-browser-release.sources \
      https://brave-browser-apt-release.s3.brave.com/brave-browser.sources \
    && apt-get update \
    && apt-get install --assume-yes brave-browser \
    && apt-get distclean

# Set up Scripture Forge data directories
RUN mkdir --parents /var/lib/scriptureforge/sync \
    && mkdir --parents /var/lib/scriptureforge/audio \
    && mkdir --parents /var/lib/scriptureforge/training-data \
    && mkdir --parents /var/lib/xforge/avatars

# Set up a non-root user for devcontainer use.
# The base image already has an 'ubuntu' user at uid 1000. Remove it and create
# a 'vscode' user at the same uid so devcontainer tooling works as expected.
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=${USER_UID}
RUN userdel -r ubuntu 2>/dev/null || true \
    && groupadd --gid ${USER_GID} ${USERNAME} \
    && useradd --uid ${USER_UID} --gid ${USER_GID} --shell /bin/bash --create-home ${USERNAME} \
    && echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${USERNAME} \
    && chmod 0440 /etc/sudoers.d/${USERNAME} \
    && mkdir --parents /workspaces \
    && chown -R ${USERNAME}:${USERNAME} /workspaces

# Set up ParatextData config
RUN mkdir --parents /home/${USERNAME}/.local/share/Paratext95 \
    && mkdir --parents /home/${USERNAME}/.local/share/SIL/WritingSystemRepository/3 \
    && echo '<?xml version="1.0" encoding="utf-8"?>\
<InternetSettingsMemento>\
  <SelectedServer>Development</SelectedServer>\
  <PermittedInternetUse>Enabled</PermittedInternetUse>\
  <ProxyPort>0</ProxyPort>\
</InternetSettingsMemento>' > /home/${USERNAME}/.local/share/Paratext95/InternetSettings.xml \
    && chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}/.local \
    && chown -R ${USERNAME}:${USERNAME} /var/lib/scriptureforge \
    && chown -R ${USERNAME}:${USERNAME} /var/lib/xforge

USER ${USERNAME}
