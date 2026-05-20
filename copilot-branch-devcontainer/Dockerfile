FROM node:22-bookworm-slim

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install basic tools, Brave browser runtime dependencies, and git
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    fonts-liberation \
    git \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libcurl4 \
    libdbus-1-3 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libudev1 \
    libvulkan1 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    sudo \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Brave Browser from the official Brave APT repository.
# brave-keyring is not needed for browser operation so it is excluded.
RUN curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg \
        https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg arch=amd64] \
        https://brave-browser-apt-release.s3.brave.com/ stable main" \
        > /etc/apt/sources.list.d/brave-browser-release.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends brave-browser \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user (vscode is the standard devcontainer user name).
# The node:22 base image already has a 'node' user; create 'vscode' following
# devcontainer conventions.
RUN useradd -ms /bin/bash vscode \
    && echo "vscode ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Point CHROMIUM_BIN at the actual Brave binary, not the /usr/bin/brave-browser
# shell wrapper.  The wrapper uses bash process-substitutions (exec > >(exec cat))
# that create cat helper processes inheriting Node.js pipe file descriptors.
# Because Brave's renderer and crashpad children daemonize (PPID=1), those cat
# processes keep running after the browser exits and hold Node.js's stdout/stderr
# pipes open.  Node.js then waits ~40 s for them to exit before it can exit
# itself, which causes the karma test run to hit the `timeout 180` limit.
# Pointing directly at the binary avoids the shell wrapper entirely: the brave
# binary is careful to set FD_CLOEXEC on pipes before it launches child
# processes, so no child inherits the pipe and Node.js exits immediately after
# karma finishes.  --no-sandbox is already configured in karma.conf.js.
ENV CHROMIUM_BIN=/opt/brave.com/brave/brave

USER vscode
WORKDIR /workspaces/web-xforge
