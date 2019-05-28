# Base box creation instructions

When creating the base box, do the following.

  - Log in to the desktop immediately so gsettings will work. You may need to attempt the login twice.
  - Resize the guest window to be slightly bigger. Launch Files, unmaximize, and close Files.
  - Automatically logging in means we don't unlock the login keyring at login. Prevent Chromium from causing the login keyring password prompt by doing the following.
    Launch 'Passwords and Keys'. Right-click Passwords > Login. Click Change Password. Change password from "vagrant" to blank. Close 'Passwords and Keys'.

Let the vagrant box shut itself down after it finishes provisioning, so the zeros file has time to be deleted.

Don't worry about a GUI low disk space warning near the end of provisioning, that's because of disk blanking.

It appears that if one section of provisioning fails, that it starts the next section rather than quitting the whole process. Check that each section completed successfully.

## Testing

After making the base box, run the manual `test` provisioner.

    vagrant provision --provision-with test

Note that you should not publish the box that you did the test in, since it won't be cleaned up from the original provision (such as deleting ssh host keys).

## Development of base box

You can run one section of the provisioning at a time. For example,

    vagrant provision --provision-with ubuntu-setup
    vagrant provision --provision-with xforge-desktop-setup

You can also take snapshots of the virtual machine and later roll back. For example,

    vagrant snapshot save after-ubuntu-setup
    vagrant snapshot restore --no-provision after-ubuntu-setup

A machine made using snapshots is still suitable for publishing.

### Pieces

Broken-down, repeatable, checkpointed steps to ease development and testing changes. Stanzas can be pasted into terminal.

    # init
    vagrant destroy && vagrant box update &&
    # ubuntu-setup
    vagrant up --provision-with ubuntu-setup && sleep 10s &&
        vagrant snapshot delete 0-after-ubuntu-setup || true &&
        vagrant snapshot save 0-after-ubuntu-setup && sleep 30s &&
    # xforge-desktop-setup
    vagrant snapshot restore --no-provision 0-after-ubuntu-setup &&
        vagrant provision --provision-with xforge-desktop-setup && sleep 10s &&
        vagrant snapshot delete 1-after-xforge-desktop-setup || true &&
        vagrant snapshot save 1-after-xforge-desktop-setup && sleep 30s &&
    # xforge-setup
    vagrant snapshot restore --no-provision 1-after-xforge-desktop-setup &&
        vagrant provision --provision-with xforge-setup && sleep 10s &&
        vagrant snapshot delete 2-after-xforge-setup || true &&
        vagrant snapshot save 2-after-xforge-setup && sleep 30s &&
    # cleanup
    vagrant snapshot restore --no-provision 2-after-xforge-setup &&
        vagrant provision --provision-with cleanup && sleep 5m &&
        vagrant snapshot delete 3-after-cleanup || true &&
        vagrant snapshot save 3-after-cleanup && sleep 30s &&
    # create product
    rm -v xforge-u1604-VERSION.box && date &&
        time vagrant package --base vag-u1604-xf-creation --output xforge-u1604-VERSION.box &&
        sha256sum *.box &&
    # test
    vagrant snapshot restore --no-provision 3-after-cleanup &&
        vagrant provision --provision-with test
