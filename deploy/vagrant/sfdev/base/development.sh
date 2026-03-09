#!/bin/bash
# Vagrant sfdev optional development tools provision script.
set -xueo pipefail

# Duplicate output to a log file
exec &> >(tee "$(mktemp --tmpdir "provision-$(date +"%F-%H%M%S")-XXXXXXXXXX.log")")

# Helper method to avoid failing from a network hiccup during provision
function tryharderto() {
  i=0
  until "$@"; do
    ((++i <= 3))
    echo >&2 "Retrying ${i}"
    sleep 2m
  done
}

sudo snap install yq
sudo snap install --beta tortoisehg

# GitKraken
sudo snap install --classic gitkraken

# Visual Studio Code https://code.visualstudio.com/docs/setup/linux
cd "$(mktemp -d)"
curl --silent --location --fail --show-error \
  https://packages.microsoft.com/keys/microsoft.asc |
  gpg --dearmor >microsoft.gpg
sudo install --owner root --group root --mode 644 \
  microsoft.gpg /etc/apt/trusted.gpg.d/
sudo tee /etc/apt/sources.list.d/vscode.list >/dev/null <<< \
  "deb [arch=amd64] https://packages.microsoft.com/repos/vscode stable main"
tryharderto sudo apt-get update
tryharderto sudo apt-get --assume-yes install code
code --install-extension EditorConfig.EditorConfig
code --install-extension eamodio.gitlens
code --install-extension ms-dotnettools.csharp
code --install-extension GitHub.copilot
code --install-extension mongodb.mongodb-vscode
code --install-extension formulahendry.dotnet-test-explorer
code --install-extension ms-dotnettools.csdevkit
code --install-extension streetsidesoftware.code-spell-checker
code --install-extension csharpier.csharpier-vscode
code --install-extension dbaeumer.vscode-eslint
code --install-extension GitHub.copilot-chat
code --install-extension ms-dotnettools.vscodeintellicode-csharp
code --install-extension ms-vsliveshare.vsliveshare
code --install-extension esbenp.prettier-vscode
code --install-extension hbenl.vscode-test-explorer

sudo tee --append /etc/sysctl.d/90-vscode.conf >/dev/null <<END
# Let VS Code, dotnet, etc watch lots of files.
fs.inotify.max_user_watches=10000000
fs.inotify.max_user_instances=10000000
END
# mono devel for OmniSharp
tryharderto sudo apt-get --assume-yes install mono-complete

# Install workspace-recommended extensions
perl -n -e 'print unless /^ *\/\//' ~/code/web-xforge/.vscode/extensions.json |
  jq --raw-output '.recommendations[]' |
  while read extension; do
    code --install-extension "${extension}"
  done

# Paratext
sudo snap install paratext --beta
sudo snap install paratextlite
sudo snap install paratext-10-studio

# Launchers
TOOLSDIR="${HOME}/Desktop"
mkdir --parents "${TOOLSDIR}"
cp -a --dereference \
  /usr/share/applications/code.desktop \
  /snap/gitkraken/current/meta/gui/gitkraken.desktop \
  /snap/paratext/current/meta/gui/paratext.desktop \
  /usr/share/applications/byobu.desktop \
  /snap/chromium/current/meta/gui/chromium.desktop \
  "${TOOLSDIR}"
chmod +x "${TOOLSDIR}"/*.desktop
perl -pi -e 's#\${SNAP}#/snap/chromium/current#' "${TOOLSDIR}"/chromium.desktop
perl -pi -e 's#\${SNAP}#/snap/paratext/current#' "${TOOLSDIR}"/paratext.desktop

# Fix icon
perl -pi -e '/Icon/ and s#.*#Icon=/snap/gitkraken/current/usr/share/gitkraken/gitkraken.png#' \
  "${TOOLSDIR}"/gitkraken.desktop

# Docker

# https://docs.docker.com/desktop/install/linux-install/
sudo usermod --append --groups kvm ${USER}

# https://docs.docker.com/engine/install/ubuntu/#set-up-the-repository
cd $(mktemp -d)
curl --silent --location --fail --show-error \
  --output docker.asc https://download.docker.com/linux/ubuntu/gpg
sudo install --owner root --group root --mode 644 docker.asc /etc/apt/keyrings/
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<-END
	Types: deb
	URIs: https://download.docker.com/linux/ubuntu
	Suites: $(lsb_release --short --codename)
	Components: stable
	Architectures: amd64
	Signed-By: /etc/apt/keyrings/docker.asc
END
tryharderto sudo apt-get update
tryharderto sudo apt-get --assume-yes install \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# This is not a great security solution. https://askubuntu.com/q/477551
sudo usermod --append --groups docker ${USER}

# Make dir ahead of time before root does and owns it.
mkdir --parents ~/.vsdbg

# /Docker

# Apply any updates
tryharderto sudo apt-get update
tryharderto sudo apt-get --assume-yes upgrade
tryharderto sudo apt-get --assume-yes dist-upgrade

echo "$0: $(date -Is): Script finished successfully."
