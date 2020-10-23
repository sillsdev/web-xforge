# Scripture Forge development base box creation instructions

## Install

* Use virtualbox manager to create a new VM with a temporary name (like `sfdev-base`).
* Give 6 GB RAM and 200 GB dynamic storage. Actual RAM available will depend on a
  Vagrantfile setting later on. Give 2 processors.
* Boot Ubuntu .iso. Install Ubuntu. Don't install unneeded "third-party software".
* Use computer name `sfdev`, username `vagrant` and password `vagrant`. Choose Log in
  automatically.

## Setup machine

* Launch Software Updater and apply updates. If that gives any trouble, can fall back to:
  boot to recovery mode, enable networking, and run `apt update && apt upgrade -y`.

* Install guest additions.

  * On your host machine, run

    sudo apt install virtualbox-guest-additions-iso

  * In the guest machine, run

    sudo apt update && sudo apt install -y linux-headers-$(uname -r) build-essential \
      dkms virtualbox-guest-utils virtualbox-guest-dkms

    In the guest machine window, choose Devices > Insert Guest Additions CD image. In the
    guest, a VBOXADDITIONS window appears; click Run. A terminal window will appear,
    asking if you want to replace versions of additions. Enter yes. It will say something
    went wrong. Right-click the CD icon on the panel or desktop and Eject the VirtualBox
    Additions disc.

  * In the guest machine window, choose Devices > Shared clipboard > Bidirectional.

  * Reboot.

* Set resolution to a big enough but conservative initial value of 1600x900, that will fit
  inside someone's 1080p desktop.

* Taking a virtual machine snapshot here makes for a good place to come back to when making
  new versions of this virtual machine.

* Run `provision` script on guest. Possibly by copying and pasting its contents into a new
  file on guest and running it with `bash provision`.

* Log out to use newly installed and activated Gnome extensions.

* Launch VSCode. Open ~/src/web-xforge folder. Install workspace-recommended extensions.

* Launch Settings. Don't use a bunch of RAM for error reports:
  Privacy - Diagnostics - Send error reports to Canonical - Never.

* Set desktop background.

* Arrange desktop icons, since may be in disarray from resizing the desktop or moving panel.
  Make a couple rows of icons, with the second row containing Chromium, Code, Byobu, Gitk,
  Git Cola.

* Clean up byobu status bar (F1).

* Optionally edit basebox version file at `~/machine-info.txt`. "Installed from" can state
  the installation media used to create the machine.

## Finalize

* Do the following to free up disk space, delete the guest's ssh host keys so they will be
  re-generated uniquely by users, and zero-out deleted files so they don't take up space
  shipping with the product. A `cat: write error: No space left on device` is expected and
  not a problem.

  sudo apt-get update && sudo apt-get -y autoremove && sudo apt-get -y clean \
    && sudo rm -v /etc/ssh/ssh_host_* \
    && cat /dev/zero > ~/zeros; sync; ls -lh ~/zeros; rm -v ~/zeros

* Power off.

## Generate and publish product

* Export VM .box file. This may take 20+ minutes. The `--base` argument is the name of the
  base machine in virtualbox manager. Replace the VERSION string in the below before
  running.

  export BOX="sfdev"
  export VERSION="1.0.0"
  date && time vagrant package --base ${BOX}-base --output ${BOX}-${VERSION}.box \
    && ls -lh ${BOX}-${VERSION}.box && sha256sum ${BOX}-${VERSION}.box

* Update the box .json file, including the sha.

* Test base box. Enable vb.gui in Vagrantfile. Give it more RAM.

  mkdir test && cd test && vagrant init ../${BOX}-${VERSION}.box && vim Vagrantfile
  vagrant up

* Clean up box test machine. In the `test` directory, run the following. Then delete the
  `test` directory. The `vagrant box remove` command removes the internally stored copy of
  the base box (to free disk space); it's not removing the '../foo' _file_, but internally
  stored data with the designation of '../foo'.

  vagrant destroy && vagrant box remove "../${BOX}-${VERSION}.box"

## Notes

* Changes to guest settings can be seen by observing differences in output from
```
gsettings list-recursively
dconf dump /
```
