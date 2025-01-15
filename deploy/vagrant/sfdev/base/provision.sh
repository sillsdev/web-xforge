#!/bin/bash
# Vagrant sfdev provision script, to be run in guest when creating basebox
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

# Vagrant Ubuntu setup
# --------------------

# Set mirror to generic
sudo perl -pi -e 's#/...archive.ubuntu.com#/archive.ubuntu.com#g' /etc/apt/sources.list

# Enable multiverse repository
sudo perl -pi -e '/multiverse/ and !/backports/ and s/^# //' /etc/apt/sources.list

# Turn off applying automatic updates, so that a user won't turn off the
# machine during updates, which may make a mess.
sudo tee /etc/apt/apt.conf.d/90disable-auto-updates >/dev/null <<END
APT::Periodic::Unattended-Upgrade "0";
END

# Apply all available updates
tryharderto sudo apt-get update
tryharderto sudo apt-get --assume-yes upgrade
tryharderto sudo apt-get --assume-yes dist-upgrade

# Swap shouldn't be necessary and may cause unnecessary churn when backing up the guest
# image. Disable and delete the swapfile.
sudo swapoff --all &&
  sudo perl -ni -e 'print unless /swapfile/' /etc/fstab &&
  sudo rm -vf /swapfile

# Don't prompt for OS upgrade to newer release
sudo perl -pi -e 's/Prompt=lts/Prompt=never/' /etc/update-manager/release-upgrades

# sshd security settings
sudo mkdir --parents /etc/ssh/sshd_config.d
sudo tee /etc/ssh/sshd_config.d/no-password-authentication-or-root.conf >/dev/null <<END
PasswordAuthentication no
PermitRootLogin no
END

# Passwordless sudo
sudo tee /etc/sudoers.d/passwordless >/dev/null <<<'vagrant ALL=(ALL) NOPASSWD: ALL'

sudo tee /etc/sudoers.d/stars >/dev/null <<END
# Show stars when typing sudo password.
Defaults pwfeedback
END
sudo chmod 0400 /etc/sudoers.d/stars

# Reveal boot information for investigating problems, rather than being pretty.
sudo perl -pi -e '/GRUB_CMDLINE_LINUX_DEFAULT/ and s/quiet//' /etc/default/grub
sudo perl -pi -e '/GRUB_CMDLINE_LINUX_DEFAULT/ and s/splash//' /etc/default/grub
sudo perl -pi -e '/GRUB_TIMEOUT_STYLE=/ and s/=hidden/=menu/' /etc/default/grub
sudo perl -pi -e '/GRUB_TIMEOUT=/ and s/=0$/=5/' /etc/default/grub

# Turn off error reporting from hogging memory
sudo perl -pi -e 's/enabled=1/enabled=0/' /etc/default/apport

# Make vagrant accessible via ssh
tryharderto sudo apt-get --assume-yes install openssh-server

# Install initial vagrant login key.
cd "$(mktemp -d)"
wget 'https://raw.githubusercontent.com/hashicorp/vagrant/master/keys/vagrant.pub'
sha512sum -c <<< \
  'f1891f744e3619e19f737d8f2742a6ffe12681fcd6878ae5ed804556bcaa7762fdbd750ed653ee3c6cfb4bb159f860187446460102100f35685c32444c2300ad  vagrant.pub'
mkdir --parents ~/.ssh
chmod 0700 ~/.ssh
mv vagrant.pub ~/.ssh/authorized_keys
chmod 0600 ~/.ssh/authorized_keys

# Prepare for ssh host keys to be re-generated uniquely by users
sudo tee /root/regenerate-ssh-host-keys >/dev/null <<END
#!/bin/bash
# Regenerate ssh host keys if not present
test -f /etc/ssh/ssh_host_rsa_key || dpkg-reconfigure --frontend=noninteractive openssh-server
END
sudo chmod +x /root/regenerate-ssh-host-keys
sudo tee /etc/systemd/system/regenerate-ssh-host-keys.service >/dev/null <<END
[Unit]
Description=regenerate-ssh-host-keys

[Service]
ExecStart=/root/regenerate-ssh-host-keys

[Install]
WantedBy=multi-user.target
END
sudo systemctl enable regenerate-ssh-host-keys

# Don't blank or lock VM screen
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false

# Don't let deja-dup hassle user about backing up from within guest
tryharderto sudo apt-get --assume-yes remove deja-dup

# Adjust bash prompt
# Use colour
perl -pi -e '/#force/ and s/^#//' ~/.bashrc
# Place $ on next line (when not already preceded by \n)
perl -pi -e '/PS1/ and s/(?<!\\n)\\\$ /\\n\\\$ /' ~/.bashrc
# Show exit code
perl -pi -e '/PS1/ and s/@/\$?/' ~/.bashrc

# Settings - Appearance - Dark
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
gsettings set org.gnome.desktop.interface gtk-theme 'Yaru-dark'

# Settings for Terminator
mkdir -p ~/.config/terminator
tee ~/.config/terminator/config >/dev/null <<END
[profiles]
  [[default]]
	scroll_on_output = False
	scrollback_infinite = True
END

tryharderto sudo apt-get --assume-yes install gnome-software-plugin-flatpak
sudo flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo

# Don't report developer or tester usage to analytics
tee --append ~/.pam_environment >/dev/null <<END
FEEDBACK=false
WESAY_TRACK_AS_DEVELOPER=1
END

# Record some base box version info, to help with diagnosis
tee ~/machine-info.txt >/dev/null <<END
Vagrant base box information
Name: sfdev
Version:
Creation date: $(date -I)
Installed from:
Notes:
END

# Keyboarding
tryharderto sudo apt-get --assume-yes install ibus-libpinyin ibus-table-thai
gsettings set org.gnome.desktop.input-sources sources \
  "[('xkb', 'us'), ('xkb', 'us+dvorak'), ('xkb', 'il'), ('xkb', 'ru'), ('ibus', 'libpinyin'), ('ibus', 'table:thai'), ('xkb', 'ara')]"

# Set unique background
IMAGE_CODE="6Ym4iEGFqzQ" # Hippo
mkdir --parents ~/.local/share/backgrounds
wget -O "${HOME}/.local/share/backgrounds/${IMAGE_CODE}-unsplash.jpg" \
  "https://unsplash.com/photos/${IMAGE_CODE}/download?force=true"
gsettings set org.gnome.desktop.background picture-uri \
  "file:///home/vagrant/.local/share/backgrounds/${IMAGE_CODE}-unsplash.jpg"
gsettings set org.gnome.desktop.background picture-uri-dark \
  "file:///home/vagrant/.local/share/backgrounds/${IMAGE_CODE}-unsplash.jpg"
gsettings set org.gnome.desktop.screensaver picture-uri \
  "file:///home/vagrant/.local/share/backgrounds/${IMAGE_CODE}-unsplash.jpg"

tryharderto sudo apt-get --assume-yes install gnome-shell-extension-manager

# Configure panel
# ------------------

# Install gnome extension dash-to-panel
cd "$(mktemp -d)"
wget 'https://extensions.gnome.org/extension-data/dash-to-paneljderose9.github.com.v56.shell-extension.zip'
sha512sum -c <<< \
  'ff8566b076e8c844b94219064ae0f4477899e9af32b2204c2f20cb2a58b382f3c0bf35bce43c439f6c1b2035493db83c87a901e633cdef558f20fd6ef0436844  dash-to-paneljderose9.github.com.v56.shell-extension.zip'
gnome-extensions install --force \
  'dash-to-paneljderose9.github.com.v56.shell-extension.zip'

# Install gnome extension system-monitor-next
tryharderto sudo apt-get --assume-yes install gir1.2-gtop-2.0 gir1.2-nm-1.0 gir1.2-clutter-1.0
cd "$(mktemp -d)"
wget 'https://extensions.gnome.org/extension-data/system-monitor-nextparadoxxx.zero.gmail.com.v55.shell-extension.zip'
sha512sum -c <<< \
  'cbd98eecc9538cf61f74e62615c8b058695632f8a74f50bfce647ad61360bfffdfcd70fce277795e1026282d9233eacc407ed2248f54f9078a633be9008618d3  system-monitor-nextparadoxxx.zero.gmail.com.v55.shell-extension.zip'
gnome-extensions install --force \
  'system-monitor-nextparadoxxx.zero.gmail.com.v55.shell-extension.zip'
# System-monitor: Display Icon: Off. Cpu, Memory, Net - Graph Width: 10, Refresh Time: 10000, Show Text: Off
dconf write /org/gnome/shell/extensions/system-monitor/icon-display false
dconf write /org/gnome/shell/extensions/system-monitor/cpu-graph-width 10
dconf write /org/gnome/shell/extensions/system-monitor/cpu-refresh-time 10000
dconf write /org/gnome/shell/extensions/system-monitor/cpu-show-text false
dconf write /org/gnome/shell/extensions/system-monitor/memory-graph-width 10
dconf write /org/gnome/shell/extensions/system-monitor/memory-refresh-time 10000
dconf write /org/gnome/shell/extensions/system-monitor/memory-show-text false
dconf write /org/gnome/shell/extensions/system-monitor/net-graph-width 10
dconf write /org/gnome/shell/extensions/system-monitor/net-refresh-time 10000
dconf write /org/gnome/shell/extensions/system-monitor/net-show-text false

# Install gnome extension ArcMenu
cd "$(mktemp -d)"
wget 'https://extensions.gnome.org/extension-data/arcmenuarcmenu.com.v48.shell-extension.zip'
sha512sum -c <<< \
  'ee9ebfeb62d29fd1387902156a17ae44e3915853030a84e997939fab924010ef5a519cf13f17d3ab56e1c2866637ff4208f7265ba30cc8c01d2815e3999efd91  arcmenuarcmenu.com.v48.shell-extension.zip'
gnome-extensions install --force \
  'arcmenuarcmenu.com.v48.shell-extension.zip'
dconf write /org/gnome/shell/extensions/arcmenu/custom-menu-button-icon-size 32.0
dconf write /org/gnome/shell/extensions/arcmenu/menu-layout "'Mint'"

# Tweaks - Extensions
gsettings set org.gnome.shell enabled-extensions \
  "['dash-to-panel@jderose9.github.com', 'system-monitor-next@paradoxxx.zero.gmail.com', 'arcmenu@arcmenu.com']"

# Settings - Notifications - Do Not Disturb. Can be turned back on if important.
gsettings set org.gnome.desktop.notifications show-banners false
# Gedit: Menu - Preferences - Fonts & Colours - Solarized Dark
gsettings set org.gnome.gedit.preferences.editor scheme 'solarized-dark'
# Terminal: Menu - Preferences - Profiles > Unnamed - Colours.
# Under Text and Background Color, clear "Use colors from system theme"; Built-in schemes: Tango dark.
# Under Palette, Build-in schemes: Tango.
dconf write /org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/use-theme-colors false
dconf write /org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/background-color "'rgb(46,52,54)'"
dconf write /org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/foreground-color "'rgb(211,215,207)'"
dconf write /org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/palette \
  "['rgb(46,52,54)', 'rgb(204,0,0)', 'rgb(78,154,6)', 'rgb(196,160,0)', 'rgb(52,101,164)', 'rgb(117,80,123)', 'rgb(6,152,154)', 'rgb(211,215,207)', 'rgb(85,87,83)', 'rgb(239,41,41)', 'rgb(138,226,52)', 'rgb(252,233,79)', 'rgb(114,159,207)', 'rgb(173,127,168)', 'rgb(52,226,226)', 'rgb(238,238,236)']"

# Configure desktop for development
# ---------------------------------

# Tools

tryharderto sudo apt-get --assume-yes install \
  ack \
  ripgrep \
  curl \
  flatpak \
  net-tools \
  tig \
  vim \
  wget \
  glances \
  inotify-tools \
  synaptic \
  dconf-cli \
  geany \
  git-gui \
  git-cola \
  jq \
  terminator \
  byobu \
  mercurial \
  meld \
  kdiff3 \
  ;

# For now, still install chromium-browser to set up /usr/bin/chromium-browser executable.
tryharderto sudo apt-get --assume-yes install chromium-browser

sudo snap install chromium
# Add MP3 support to Chromium
sudo snap install chromium-ffmpeg

# Ideally, application specific signing keys would be stored in
# /usr/share/keyrings/, with the repo source specifying signed-by it. But Chrome
# and Edge have daily cron jobs that re-establish their own settings, even
# putting the key in the globally trusted area. And Code gives an error during
# installation if its key isn't in the globally trusted area. Not fighting with
# it.

# Chrome
cd $(mktemp -d)
curl --silent --location --fail --show-error \
  https://dl.google.com/linux/linux_signing_key.pub |
  gpg --dearmor >google-chrome.gpg
sudo install --owner root --group root --mode 644 \
  google-chrome.gpg /etc/apt/trusted.gpg.d/
sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null <<< \
  "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main"
tryharderto sudo apt-get update
tryharderto sudo apt-get --assume-yes install google-chrome-stable

# Edge
cd $(mktemp -d)
curl --silent --location --fail --show-error \
  https://packages.microsoft.com/keys/microsoft.asc |
  gpg --dearmor >microsoft.gpg
sudo install --owner root --group root --mode 644 \
  microsoft.gpg /etc/apt/trusted.gpg.d/
sudo tee /etc/apt/sources.list.d/microsoft-edge.list >/dev/null <<< \
  "deb [arch=amd64] https://packages.microsoft.com/repos/edge stable main"
tryharderto sudo apt-get update
tryharderto sudo apt-get --assume-yes install microsoft-edge-stable

# Brave
cd $(mktemp -d)
curl --silent --location --fail --show-error \
  --output brave-browser-archive-keyring.gpg \
  https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg
sudo install --owner root --group root --mode 644 \
  brave-browser-archive-keyring.gpg /etc/apt/keyrings/
sudo tee /etc/apt/sources.list.d/brave-browser-release.sources >/dev/null <<-END
	Types: deb
	URIs: https://brave-browser-apt-release.s3.brave.com/
	Suites: stable
	Components: main
	Architectures: amd64
	Signed-By: /etc/apt/keyrings/brave-browser-archive-keyring.gpg
END
tryharderto sudo apt-get update
tryharderto sudo apt-get --assume-yes install brave-browser

sudo snap install yq
sudo snap install --beta tortoisehg

# GitKraken
sudo snap install --classic gitkraken

# Visual Studio Code https://code.visualstudio.com/docs/setup/linux
cd "$(mktemp -d)"
curl --silent --location --fail --show-error \
  https://packages.microsoft.com/keys/microsoft.asc |
  gpg --dearmor >microsoft.gpg
sha512sum --check <<<'467cb24244b845d46257ae17af70ead505cc4d9064d4ab0c65dc528170e5faa8d3cb948160036e05ccb574922f0a481d8ddf086c9a278506854c924d6beada5a  microsoft.gpg'
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
code --install-extension stkb.rewrap
code --install-extension hbenl.vscode-test-explorer

# Let VS Code, dotnet, etc watch lots of files.
sudo tee --append /etc/sysctl.conf >/dev/null <<END
fs.inotify.max_user_watches=10000000
fs.inotify.max_user_instances=10000000
END
sudo sysctl -p
# mono devel for OmniSharp
tryharderto sudo apt-get --assume-yes install mono-complete

# Mercurial settings
tee ~/.hgrc >/dev/null <<END
[extensions]
purge =
END

# Further adjust bash prompt
# Show if in flatpak
perl -pi -e 'if (/PS1/ and !/FLATPAK_ID/) { s,chroot\)\},chroot\)\}\${FLATPAK_ID+📦 \${FLATPAK_ID} }, }' ~/.bashrc
# Show git repo info
perl -pi -e 'if (/PS1/ and !/__git_ps1/) { s,\\n,\$(! type __git_ps1 &>/dev/null || __git_ps1)\\n, }' ~/.bashrc
grep --quiet 'GIT_PS1_SHOW' ~/.bashrc || tee --append ~/.bashrc >/dev/null <<END
export GIT_PS1_SHOWDIRTYSTATE=true
export GIT_PS1_SHOWSTASHSTATE=true
export GIT_PS1_SHOWUNTRACKEDFILES=true
export GIT_PS1_SHOWUPSTREAM="auto"
export GIT_PS1_HIDE_IF_PWD_IGNORED=true
export GIT_PS1_SHOWCOLORHINTS=true
END

# Git and GUI git tools settings
git config --global diff.tool meld
git config --global merge.conflictstyle diff3
git config --global merge.tool kdiff3
git config --global color.ui true
git config --global rerere.enabled true
git config --global gui.editor gedit
git config --global rebase.autosquash true
# Git Cola settings. Set textwidth to help auto wrap commit messages.
git config --global cola.textwidth 70
git config --global cola.tabwidth 2
git config --global cola.linebreak true
git config --global cola.theme flat-dark-blue
git config --global cola.icontheme dark
# Arrange diff, commit, status, actions, branches, and console areas.
mkdir -p "${HOME}/.config/git-cola"
tee "${HOME}/.config/git-cola/settings" >/dev/null <<END
{
    "gui_state": {
        "mainview": {
            "geometry": "AdnQywADAAAAAAA9AAAABwAABNsAAANKAAAAPQAAACwAAATbAAADSgAAAAAAAAAABkAAAAA9AAAALAAABNsAAANK",
            "width": 1200,
            "height": 800,
            "x": 50,
            "y": 10,
            "lock_layout": false,
            "windowstate": "AAAA/wAAAAL9AAAAAQAAAAIAAASfAAADB/wBAAAAA/sAAAAIAEQAaQBmAGYBAAAAAAAAAqoAAAB1AP////wAAAKtAAAB8gAAARUA/////AIAAAAE+wAAAAwAQwBvAG0AbQBpAHQBAAAAGAAAALsAAABFAP////sAAAAMAFMAdABhAHQAdQBzAQAAANYAAAEKAAAARQD////7AAAADgBBAGMAdABpAG8AbgBzAQAAAeMAAABFAAAARQD////8AAACKwAAAPQAAABFAP////wBAAAAAvsAAAAQAEIAcgBhAG4AYwBoAGUAcwEAAAKtAAAA7AAAAKIA////+wAAAA4AQwBvAG4AcwBvAGwAZQEAAAOcAAABAwAAAHAA/////AAAAqYAAAH5AAAAAAD////6/////wEAAAAD+wAAABQAUwB1AGIAbQBvAGQAdQBsAGUAcwAAAAAA/////wAAALgA////+wAAABIARgBhAHYAbwByAGkAdABlAHMAAAAAAP////8AAAC2AP////sAAAAMAFIAZQBjAGUAbgB0AAAAAAD/////AAAAkgD///8AAASfAAAAAAAAAAQAAAAEAAAACAAAAAj8AAAAAA=="
        }
    }
}
END
# gitk solarized dark colour scheme
mkdir -p "${HOME}/.config/git"
tee "${HOME}/.config/git/gitk" >/dev/null <<END
set mainfont {sans 9}
set textfont {monospace 9}
set uifont {sans 9 bold}
set tabstop 8
set findmergefiles 0
set maxgraphpct 50
set maxwidth 16
set cmitmode patch
set wrapcomment none
set autoselect 1
set autosellen 40
set showneartags 1
set maxrefs 20
set visiblerefs {"master"}
set hideremotes 0
set showlocalchanges 1
set datetimeformat {%Y-%m-%d %H:%M:%S}
set limitdiffs 1
set uicolor #657b83
set want_ttk 1
set bgcolor #002b36
set fgcolor #839496
set uifgcolor #839496
set uifgdisabledcolor #586e75
set colors {"#6c71c4" "#268bd2" "#2aa198" "#859900" "#b58900" "#cb4b16" "#dc322f" "#d33682"}
set diffcolors {"#dc322f" "#859900" "#268bd2"}
set mergecolors {"#dc322f" "#268bd2" "#859900" "#6c71c4" brown "#009090" #d33682 "#808000" "#009000" "#ff0080" "#2aa198" "#b07070" "#70b0f0" "#70f0b0" "#f0b070" "#ff70b0"}
set markbgcolor #073642
set diffcontext 3
set selectbgcolor #586e75
set foundbgcolor #b58900
set currentsearchhitbgcolor #cb4b16
set extdifftool meld
set perfile_attrs 0
set headbgcolor #2aa198
set headfgcolor #002b36
set headoutlinecolor #839496
set remotebgcolor #6c71c4
set tagbgcolor #d33682
set tagfgcolor #002b36
set tagoutlinecolor #002b36
set reflinecolor #839496
set filesepbgcolor #073642
set filesepfgcolor #839496
set linehoverbgcolor #073642
set linehoverfgcolor #839496
set linehoveroutlinecolor #839496
set mainheadcirclecolor #fdf6e3
set workingfilescirclecolor #dc322f
set indexcirclecolor #859900
set circlecolors {white #268bd2 gray #268bd2 #268bd2}
set linkfgcolor #268bd2
set circleoutlinecolor #073642
set web_browser xdg-open
set geometry(main) 1227x739+53+11
set geometry(state) normal
set geometry(topwidth) 1227
set geometry(topheight) 425
set geometry(pwsash0) "684 1"
set geometry(pwsash1) "1046 1"
set geometry(botwidth) 773
set geometry(botheight) 309
set permviews {}
END

# Geany colour scheme Solarized Dark
cd "$(mktemp -d)"
wget 'https://raw.githubusercontent.com/geany/geany-themes/80d4762675d16063fb776e55b49973f3cbdc69bb/colorschemes/solarized-dark.conf'
sha512sum -c <<< \
  '55ec328eb7d0239fb465ea54c4bc70d02a16225f560eb36bd069641804189d42704c253ccb2ef2253e46fbac876bc0b6ffbb8d50684212403fde001f700a99c2  solarized-dark.conf'
mkdir -p ~/.config/geany/colorschemes
mv solarized-dark.conf ~/.config/geany/colorschemes/
[[ -f ~/.config/geany/geany.conf ]] ||
  tee ~/.config/geany/geany.conf >/dev/null <<END
[geany]
color_scheme=solarized-dark.conf
END

# Launchers
TOOLSDIR="${HOME}/Desktop"
mkdir --parents "${TOOLSDIR}"
cp -a --dereference \
  /usr/share/applications/{terminator,code,byobu}.desktop \
  /snap/gitkraken/current/meta/gui/gitkraken.desktop \
  /snap/chromium/current/meta/gui/chromium.desktop \
  "${TOOLSDIR}"
chmod +x "${TOOLSDIR}"/*.desktop
perl -pi -e 's#\${SNAP}#/snap/chromium/current#' "${TOOLSDIR}"/chromium.desktop

# Fix icon
perl -pi -e '/Icon/ and s#.*#Icon=/snap/gitkraken/current/usr/share/gitkraken/gitkraken.png#' \
  "${TOOLSDIR}"/gitkraken.desktop

# SF Development machine setup
# ------------------------------------

# Paratext
sudo snap install paratext --beta
sudo snap install paratextlite

BASEDIR="${HOME}"

OUTPUTFILE="${TOOLSDIR}/sf-git-cola.desktop"
tee "${OUTPUTFILE}" >/dev/null <<ENDOFOUTPUTFILE
#!/usr/bin/env xdg-open

[Desktop Entry]
Version=1.0
Type=Application
Terminal=false
Exec=bash -c 'cd \${HOME}/code/web-xforge && git cola'
Name=SF Git Cola Commit Tool
Icon=/usr/share/git-cola/icons/git-cola.svg
ENDOFOUTPUTFILE
chmod +x "${OUTPUTFILE}"

OUTPUTFILE="${TOOLSDIR}/sf-gitk.desktop"
tee "${OUTPUTFILE}" >/dev/null <<ENDOFOUTPUTFILE
#!/usr/bin/env xdg-open

[Desktop Entry]
Version=1.0
Type=Application
Terminal=false
Exec=bash -c 'cd \${HOME}/code/web-xforge && gitk --branches origin/master origin/develop origin/sf-qa origin/sf-live HEAD'
Name=SF Git History Viewer
Icon=/usr/share/git-gui/lib/git-gui.ico
ENDOFOUTPUTFILE
chmod +x "${OUTPUTFILE}"

cp -a --dereference \
  /usr/share/applications/{terminator,geany,code,byobu}.desktop \
  /snap/paratext/current/meta/gui/paratext.desktop \
  "$TOOLSDIR"
chmod +x "${TOOLSDIR}"/*.desktop
perl -pi -e 's#\${SNAP}#/snap/paratext/current#' "${TOOLSDIR}"/paratext.desktop

# Trust the launchers. In Ubuntu 20.04 it seems to only work on the desktop.
cd ~/Desktop
for launcher in *.desktop; do
  gio set "${launcher}" metadata::trusted true
done

# Set panel icons
gsettings set org.gnome.shell favorite-apps \
  "['chromium_chromium.desktop', 'google-chrome.desktop', 'microsoft-edge.desktop', 'firefox_firefox.desktop', 'brave-browser.desktop', 'org.gnome.Nautilus.desktop', 'code.desktop']"

## SF repo and dev dependencies setup

tryharderto sudo apt-get --assume-yes install ansible git

mkdir --parents ~/code
ln --symbolic --no-target-directory --force code ~/src
cd ~/code
if [ ! -d "web-xforge" ]; then
  git clone --branch ${XF_BRANCH-master} https://github.com/sillsdev/web-xforge.git
  cd web-xforge
  git config --add remote.origin.fetch +refs/notes/*:refs/notes/*
else
  cd web-xforge
  git pull --ff-only
fi

cd ~/code/web-xforge/deploy/
ansible-playbook dev-server.playbook.yml --limit localhost --diff

# Install workspace-recommended extensions
perl -n -e 'print unless /^ *\/\//' ~/code/web-xforge/.vscode/extensions.json |
  jq --raw-output '.recommendations[]' |
  while read extension; do
    code --install-extension "${extension}"
  done

# Prevent npm @angular/cli from stopping to ask if we want to feed their analytics
export NG_CLI_ANALYTICS=false
# Download dependencies so VSCode doesn't show errors on start, like missing jest
cd ~/code/web-xforge && dotnet tool restore
# (Help npm not potentially stall.)
npm_maxsockets="$(npm config get maxsockets)"
npm config set maxsockets 1
cd ~/code/web-xforge/src/RealtimeServer && npm ci
cd ~/code/web-xforge/src/SIL.XForge.Scripture/ClientApp && npm ci
npm config set maxsockets "${npm_maxsockets}"
cd ~/code/web-xforge && dotnet build

# Clean up
cd ~/code/web-xforge && find test src -name obj -print0 | xargs -0 rm -vrf
cd ~/code/web-xforge && dotnet clean
# Undo temporary changes and/or clean up
cd ~/code/web-xforge && git checkout -- .config/dotnet-tools.json

# Use system hg.
tee --append ~/.pam_environment >/dev/null <<<'HG_PATH=/usr/bin/hg'

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

# Create readme
sudo tee ~/Desktop/machine-instructions.txt >/dev/null <<END
Scripture Forge Development Machine

Verify that your git author info was copied in from your
host machine by printing the values with the
following commands.

  git config --get user.name
  git config --get user.email

If not correct, run

  git config --global user.name "My Name"
  git config --global user.email "me@example.com"

Automatic OS security updates are turned off (so they don't get scrambled by
switching off the guest). Install security and other updates since the
basebox was created by running "Software Updater" or by running the following.
Try again in a few minutes if the system is already busy fetching updates in
the background.

  sudo apt update && sudo apt dist-upgrade

The vagrant password is "vagrant".

See the xForge Project Workflow gdoc for setting developer secrets,
Paratext account setup, enabling multiple monitors in VirtualBox, etc.

SF is cloned in ~/code/web-xforge .
Launchers for development tools are on the desktop.

You may find it helpful to increase the amount of RAM your virtual machine
is given. To do this, run the following in your host (not this guest vagrant).
Log out and back in to your host and start the vagrant guest again.

  tee --append ~/.pam_environment <<< "SFDEV_RAM=16000"
END

# Apply any updates
tryharderto sudo apt-get update
tryharderto sudo apt-get --assume-yes upgrade
tryharderto sudo apt-get --assume-yes dist-upgrade

echo "$0: $(date -Is): Script finished successfully."
