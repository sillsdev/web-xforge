# Instructions to create base box

These are instructions to create the vagrant base box. Not for fetching or
using it.

## Install

- Use virtualbox manager to create a new VM with a temporary name
  (like `sfdev-base`).
- Give 8 GB RAM (to provision without problems) and 300 GB dynamic storage.
  The actual RAM available in the product will depend on a Vagrantfile setting
  later on.
- In Settings for the guest, give 2-4 processors.
- Boot installation .iso. Install OS. Don't install unneeded
  "third-party software" in Ubuntu.
- Use computer name `sfdev`, username `vagrant` and password `vagrant`.
  Choose Log in automatically.

## Setup machine

- Set resolution to a big enough but conservative initial value of 1440x900,
  that will fit inside someone's 1080p desktop.

- Launch Software Updater, apply updates, and reboot into any new kernel. If
  that gives any trouble, fall back to: boot to recovery mode, enable
  networking, and run `apt update && apt upgrade --assume-yes`.

- Install guest additions.

  - On your host machine, you may need to run the following if you have
    VirtualBox installed from Ubuntu rather than from Oracle.

    sudo apt install virtualbox-guest-additions-iso

  - In the guest machine window, choose Devices > Insert Guest Additions CD
    image. In the guest machine, run

    ```
    sudo apt update &&
      sudo apt install --assume-yes build-essential &&
      sudo /media/vagrant/VBox*/VBoxLinuxAdditions.run
    ```

  - Right-click the CD icon on the panel or desktop and Eject the
    VirtualBox Additions disc.

  - In the guest machine window, choose Devices > Shared clipboard >
    Bidirectional.

  - Reboot guest.

- Taking a virtual machine snapshot here makes for a good place to come back to
  when making new versions of this virtual machine. Or when fixing problems with
  the provision script.

- Run provision script on guest by copying and pasting its contents
  into a new file on guest and running it. For example,

  nano ~/provision.sh && bash ~/provision.sh

- Reboot.

- Launch Extension Manager. Open settings for Dash to Panel. On the Position
  tab move the "Date menu" down to after the "System menu". Turn off visibility
  for "Show Applications button".

- Arrange desktop icons. Consider making rows:

  - Home, GitKraken, machine-instructions
  - Terminator, Paratext, Geany, Chromium
  - Byobu, Code, Gitk, Git Cola.

- Clean up byobu status bar (F1), turning off everything.

- Optionally edit basebox version file at `~/machine-info.txt`.
  "Installed from" can state the installation media used to create the machine.

## Finalize

- Do the following to free up disk space, delete the guest's ssh host keys so
  they will be re-generated uniquely by users, and zero-out deleted files so
  they don't take up space shipping with the product.
  A `cat: write error: No space left on device` is expected and not a problem.

  ```
  sudo apt-get update &&
    sudo apt-get --assume-yes autoremove &&
    sudo apt-get --assume-yes clean &&
    sudo rm -v /etc/ssh/ssh_host_* &&
    cat /dev/zero > ~/zeros; sync; ls -lh ~/zeros; rm -v ~/zeros
  ```

- Power off.

## Generate and publish product

- Export VM .box file and prepare to test the result. This may take 30 minutes.
  The `--base` argument is the name of the base machine in virtualbox manager.
  Edit the value VERSION in the first line below before running.

```
export BOX="sfdev" && export VERSION="1.2.0" &&
  date && vagrant package --base ${BOX}-base --output ${BOX}-${VERSION}.box &&
  date && ls -lh ${BOX}-${VERSION}.box &&
  sha256sum ${BOX}-${VERSION}.box | tee --append "${BOX}".json &&
  date && mkdir test && tee test/Vagrantfile <<END &&
  Vagrant.configure("2") do |config|
    config.vm.box = "../${BOX}-${VERSION}.box"
    config.vm.provider "virtualbox" do |vb|
      vb.gui = true
      vb.cpus = 2
      vb.memory = "14000"
    end
  end
END
  cd test &&
  vagrant up; date
```

- Test the result. Such as by adding secrets,
  [launching](https://github.com/sillsdev/web-xforge/wiki/Debugging) backend,
  frontend, and browser, and in VSCode attaching via
  "Attach to frontend",
  "Attach to backend dotnet application", and
  "Attach to backend realtime server".

- Clean up box test machine. In the `test` directory, run the following.
  The `vagrant box remove` command removes the internally stored copy of the
  base box (to free disk space); it's not removing the '../foo' _file_, but
  internally stored data with the designation of '../foo'.

  ```
  vagrant halt &&
    vagrant destroy &&
    vagrant box remove "../${BOX}-${VERSION}.box" &&
    cd .. &&
    rm test -rf
  ```

- Publish basebox.

## Notes

- Changes to guest settings can be seen by observing differences in output from

```
gsettings list-recursively
dconf dump /
inotifywatch --verbose --recursive ~
```

- You can free up space by deleting old base boxes. `vagrant box prune`
