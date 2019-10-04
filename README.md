# web-xforge

The existing site details are [here](https://github.com/sillsdev/web-languageforge/blob/master/README-legacy.md). This document is for the **Beta** sites.

[Language Forge](https://languageforge.org) and [Scripture Forge](https://scriptureforge.org) represent different websites, but have the same code base stored in one [repository](https://github.com/sillsdev/web-languageforge).

## Users

To use **Language Forge** go to [languageforge.org](https://languageforge.org).

To use **Scripture Forge** go to [beta.scriptureforge.org](https://beta.scriptureforge.org).

### User Problems

To report a user issue with the **Language Forge** application, email "languageforgeissues @ sil dot org".

To report a user issue with the **Scripture Forge** application, email "scriptureforgeissues @ sil dot org".

## Special Thanks To

For end-to-end test automation:

[![BrowserStack Logo](readme_images/browserstack-logo.png "BrowserStack")](https://www.browserstack.com/)

For error reporting:

[![Bugsnag logo](readme_images/bugsnag-logo.png "Bugsnag")](https://bugsnag.com/blog/bugsnag-loves-open-source)

## Developers

### Builds

Status of builds from our continuous integration (CI) [server](https://build.palaso.org):

| Site               | Master Unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Master E2E          | QA                                                                                                                                                                                                                                                       | Live                                                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scripture Forge v2 | ![Build Status](<https://build.palaso.org/app/rest/builds/buildType:(id:SFv2_ScriptureForgeMasterUnitTests)/statusIcon>) ![Test coverage](<https://img.shields.io/badge/dynamic/xml?label=C%23%20test%20coverage&suffix=%&query=/properties/property[@name=%22CodeCoverageS%22]/@value&url=https%3A%2F%2Fbuild.palaso.org%2Fapp%2Frest%2Fbuilds%2FbuildType%3A(id%3ASFv2_ScriptureForgeMasterUnitTests)%2Fstatistics%3Fguest%3D1&style=flat>) <br />Angular test coverage not reported here but available in TC | not yet operational | ![Build Status](<https://build.palaso.org/app/rest/builds/buildType:(id:xForgeDeploy_ScriptureForgeV2qaBeta)/statusIcon>) ![Website](https://img.shields.io/website?down_message=offline&up_message=online&url=https%3A%2F%2Fqa.beta.scriptureforge.org) | ![Build Status](<https://build.palaso.org/app/rest/builds/buildType:(id:xForgeDeploy_ScriptureForgeV2beta)/statusIcon>) ![Website](https://img.shields.io/website?down_message=offline&up_message=online&url=https%3A%2F%2Fbeta.scriptureforge.org) |

Successful builds from our CI server deploy to:

| Site               | QA                                                               | Live                                                       |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Scripture Forge v2 | [qa.beta.scriptureforge.org](https://qa.beta.scriptureforge.org) | [beta.scriptureforge.org](https://beta.scriptureforge.org) |

### Gitflow

We use [Gitflow](http://nvie.com/posts/a-successful-git-branching-model/) with some modifications:

- Our `master` branch is the Gitflow `develop` development branch. All pull requests go against `master`.
- Our `qa` branch is similar to a Gitflow `release` branch.
- Our `live` branch is the the Gitflow `master` production branch.

If you are working on a site _Beta_ then it looks like normal Gitflow and pull requests go against the relevant site development branch.

We merge from `master` to the QA testing branch, then ship from the QA branch to the live production branch.

| Site               | Development Branch | QA Branch | Live Branch |
| ------------------ | ------------------ | --------- | ----------- |
| Scripture Forge v2 | `master`           | `sf-qa`   | `sf-live`   |

### Style Guides

TypeScript follows the [Angular Style Guide](https://angular.io/guide/styleguide). This is opinionated not only about things like file name conventions but also file and folder structure.

To this end you'll also want to be familiar with [Upgrading from AngularJS](https://angular.io/guide/upgrade) particularly the [Preparation](https://angular.io/guide/upgrade#preparation) section.

We use [Prettier](https://prettier.io/) with a pre-commit hook.

### Layout

We use [Angular Flex-Layout](https://github.com/angular/flex-layout) with [Angular MDC](https://trimox.github.io/angular-mdc-web) including the [Material Design Icons](https://google.github.io/material-design-icons/).

### Recommended Development Environment

Our recommended development environment for web development is Ubuntu 16.04.

- [Vagrant GUI Setup](#vagrant-gui-setup). A Vagrant box with xForge already installed is downloaded and set up on your machine. This is the easiest and cleanest to setup.
- [Local Linux Development Setup](#local-linux-development-setup). Everything is installed directly on your machine, which needs to be running Ubuntu 16.04. This is the fastest method because development is not done in a virtual machine.
- [Manual Setup](#manual-setup) This setup is specifically written for **Windows** but the steps could be used for any OS.

#### Vagrant GUI Setup

Install [VirtualBox](https://www.virtualbox.org/), [Vagrant](https://www.vagrantup.com/), and [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git). To do this in Linux, run

    sudo apt install vagrant virtualbox virtualbox-guest-additions-iso git

Setup git. At least name and email is needed in `.gitconfig`. You can do this from a terminal by running

    git config --global user.name "My Name"
    git config --global user.email "me@example.com"

Hardware-assisted virtualization (VT-x or AMD-V) needs to be enabled in your BIOS.

Create a directory to manage the development machine, such as `xforge`. Checkout the xforge git repository to access (and later receive updates to) the vagrant development machine configuration file:

    git clone https://github.com/sillsdev/web-xforge
    cd web-xforge/deploy/vagrant_xenial_gui

Run `vagrant up`. This will download, initialize, and run the development machine. The machine is about 5GB, so expect the download to take a while.

In the guest development machine, do the following additional steps that may not yet be performed by the vagrant provisioner:

```shell
sudo n lts
cd ~/src/web-xforge/
dotnet clean
cd ~/src/web-xforge/src/SIL.XForge.Scripture/ClientApp
npm i
cd ~/src/web-xforge/src/RealtimeServer
npm i
cd ~/src/web-xforge/src/SIL.XForge.Scripture
dotnet run
```

In the guest development machine, after compiling and running Scripture Forge, browse to http://localhost:5000 and log in.

#### Local Linux Development Setup

Start by installing Git and Ansible:

```shell
sudo add-apt-repository ppa:ansible/ansible
sudo apt update
sudo apt install -y git ansible
```

Now create a directory for installation and clone the repo:

```shell
git clone --recurse-submodules https://github.com/sillsdev/web-xforge
```

The `--recurse-submodules` is used to fetch many of the Ansible roles used by the Ansible playbooks in the deploy folder. If you've already cloned the repo without `--recurse-submodules`, run `git submodule update --init --recursive` to pull and initialize them.

Change the variable `mongo_path: /var/lib/mongodb` in `deploy/vars/config_palaso.yml`. Set it to a location where MongoDB should store its databases.

- **Vagrant VM Setup**: uncomment line 5 and comment line 4
- **Local Linux Development Setup**: uncomment line 4 and comment line 5 (or whatever is appropriate on your system, its best to have Mongo store databases on your HDD rather than SSD). Make sure the `mongodb` user has permission to read and write to the path you specify.

Run the following Ansible playbook (works on Ubuntu Xenial and Bionic).

```bash
cd web-xforge/deploy
ansible-playbook playbook_bionic.yml --limit localhost -K
```

Add developer secrets. Ask another developer how to get these.

In `src/SIL.XForge.Scripture/`, run `dotnet run`. Browse to `http://localhost:5000`.

#### Manual Setup

Although this setup is specifically written for **Windows**, the steps could be used for any OS and only step 3 is a Windows specific link. The order below is not particulalry important.

1. Install `git`, e.g. [Git Kraken](https://www.gitkraken.com/download)
2. Clone the repo from the command line including recursing submodules (feel free to clone with SSH instead of HTTPS):

   `git clone --recurse-submodules https://github.com/sillsdev/web-xforge`.

3. Install [MongoDB v4](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-windows/) as a service
4. Install [.Net Core SDK-2.1](https://dotnet.microsoft.com/download/dotnet-core/2.1)
5. Install [Node v10](https://nodejs.org/en/download/)
6. Install [FFmpeg v4](https://ffmpeg.org/download.html) executable into the `C:\usr\bin\` directory.
7. Install a developer editor, [VS Code](https://code.visualstudio.com/download) is recommended (the repo includes VS Code settings)
8. Create folders owned by you. Check in the Ansible `deploy/dependencies.yml` for the valid list of folders. As of writing they were:

   - `/var/lib/scriptureforge/sync/`
   - `/var/lib/scriptureforge/audio/`
   - `/var/lib/xforge/avatars/`

   On Windows, just put these off your root drive, e.g. `C:\var\lib\...`

9. Add developer secrets. Ask another developer how to get these.
10. In `src/SIL.XForge.Scripture/`, run `dotnet run`. Browse to `http://localhost:5000`.

### Development Process

The first task on a job is to create a feature branch. Branch off of the **master** branch.

```bash
git checkout master
git pull
git checkout -b feature/<featureName>
```

Do some useful work and commit it.

Upload your work:

```bash
git push origin feature/<featureName>
```

Rebase often (at least at the start of the day, and before making a PR). Force pushing to your own branch is fine (even during review).

Make PR's against the **master** branch. If the **master** branch has moved on since the feature branch was made, rebase your changes on top of the **master** branch before making your PR.

Ensure all [tests](#testing) are passing before submitting a PR.

We use [Reviewable](https://reviewable.io/) for GitHub Pull Requests (PRs). When submitting a PR, a **This change is Reviewable** link is added to the PR description. Remember to click the **Publish** button after adding comments in Reviewable.

If the person reviewing feels comfortable to approve it they can. However if they want other eyes on it, mention it in a comment on the PR.
If you have minor changes to request on a PR you can say 'Make change X and then LGTM'. This means the person making the PR can merge it themselves after the requested change.
People merging PRs can and should rebase the completed PR change (default to squash and rebase unless commits have good reason to stay separate).

Delete the PR branch after merge.

### Reference

- Angular Tutorial https://angular.io/tutorial
- Angular https://angular.io/api
- Angular MDC https://trimox.github.io/angular-mdc-web/#/angular-mdc-web/button-demo/api
- Angular Material https://material.angular.io/components/categories
- TypeScript https://www.typescriptlang.org/docs/home.html
- JavaScript https://developer.mozilla.org/en-US/docs/Web/JavaScript
- ts-mockito https://github.com/NagRock/ts-mockito#ts-mockito--
- Mockito (for Java Mockito, but helps know how to use ts-mockito) http://static.javadoc.io/org.mockito/mockito-core/2.23.0/org/mockito/Mockito.html

## Testing

### .NET Unit Testing

To run .NET backend unit tests, from the repo (repository) root

```bash
dotnet test
```

See documentation for [running tests](https://docs.microsoft.com/en-us/dotnet/core/tools/dotnet-test?tabs=netcore21) and [writing tests](https://docs.microsoft.com/en-us/dotnet/core/testing/unit-testing-with-nunit).

### Node Unit Testing

To run Node backend unit tests, from the repo root

```bash
cd src/RealtimeServer
npm test
```

[Jest](https://jestjs.io/) is the test framework for the Node backend.

#### Debugging Unit Tests

Unit tests can be debugged easily in VS Code using the [Jest extension](https://github.com/jest-community/vscode-jest). After installing the exension, start the Jest test runner by executing the `Jest: Start Runner` command in the VS Code command palette. The runner will automatically run all of the Node unit tests and display a green or red circle next to each unit test indicating whether the unit test passed. If the unit test failed, a `Debug` code lens command will appear above the test. Set a breakpoint and click on the command.

### Angular Linting and Prettiering

To check TypeScript for readability, maintainability, and functionality errors, and to check a few other files for proper formatting. From the repo root

```bash
cd src/SIL.XForge.Scripture/ClientApp/
npm run prettier
ng lint
```

Or just use VS Code with this project's recommended extensions.

### Angular Unit Testing

To run front end unit tests, make sure `ng serve` is **not** running (_CTRL-C_ to end them), then from the repo root

```bash
cd src/SIL.XForge.Scripture/ClientApp/
CHROME_BIN=chromium-browser ng test
```

You can make the environment variable (`CHROME_BIN=chromium-browser`) permanent by following the instructions [here](https://help.ubuntu.com/community/EnvironmentVariables), then you can simply run `ng test`. The environment variable is already set in the vagrant.

`ng test` will monitor and run tests in a Chromium browser window. You can also monitor and run tests headlessly from the command line by running

```bash
src/SIL.XForge.Scripture/ClientApp/monitor-test-headless.sh
```

Or just run tests once without monitoring with

```bash
src/SIL.XForge.Scripture/ClientApp/test-headless.sh
```

You can filter the tests to compile and run by passing spec file names as arguments. For example,

```bash
src/SIL.XForge.Scripture/ClientApp/monitor-test-headless.sh some.component.spec.ts another.component.spec.ts
```

#### Debugging Unit Tests

The best way to debug Angular unit tests is with Chrome/Chromium.

- Run `npm test` (which will include source maps, `ng test` does not)
- When the Chrome/Chromium window appears, press _F12_
- Click the Sources tab
- Files might show up under `webpack://` or `context/localhost:dddd/src` or elsewhere, but you can always press _CTRL-P_ and type the name of a file to get there faster.

[This video](https://youtu.be/NVqplMyOZTM) has a live demo of the process.

It is also possible to debug Angular unit tests in VS Code.

- Open the spec file that you want to debug in VS Code.
- Set a breakpoint.
- Navigate to the Debug view.
- Select `Karma active spec` from the debug dropdown.
- Click the `Start Debugging` button.

This will run `ng test` on the active spec file, open Chrome, and attach the VS Code debugger. You can refresh the page by clicking the `Restart` button in the Debug toolbar.

#### Filtering Unit Tests

To run (or not to run) specific tests or fixtures, you can use the prefixes `f`ocus and e`x`clude, as in `fdescribe` or `fit` to run only the specified functions, or `xdescribe` and `xit` to skip running the specified functions (but all functions will still be built). To skip building extra tests, use the `--include` option when running `ng test`. See the [Angular CLI docs](https://angular.io/cli/test) for more info.

See documentation for [running tests](https://github.com/angular/angular-cli/wiki/test) and [writing tests](https://angular.io/guide/testing#testing).

### Angular End-To-End (E2E) Testing

To run E2E tests, make sure you are serving the app. From the repo root

```bash
cd src/SIL.XForge.Scripture/
dotnet run --environment "Testing"
```

In another terminal, from the repo root

```bash
cd src/SIL.XForge.Scripture/ClientApp/
./rune2e.sh
```

#### Debugging E2E Tests

To debug E2E tests, from the repo root

```bash
cd src/SIL.XForge.Scripture/
dotnet run --environment "Testing"
```

In another terminal, from the repo root

```bash
cd src/SIL.XForge.Scripture/ClientApp/
ng serve
```

Add a new line of `debugger;` to the `*.e2e-spec.ts` where you want it to break.

In another terminal, from the repo root

```bash
cd src/SIL.XForge.Scripture/ClientApp/
./rune2e.sh debug
```

Open `chrome://inspect/#devices` in Chromium and click **inspect**. This opens an instance of DevTools and immediately breaks the code at the top of the ng module. Click the continue button (or press F8) in your debugger to run your e2e tests, and hit any `debugger` statements in your code. Close the DevTools window to finish the tests.

### PWA Testing

To test the PWA (Progressive Web App), build the app for PWA testing and run the server without `ng serve`. From the repo root

```bash
cd src/SIL.XForge.Scripture/ClientApp/
ng build --configuration=pwaTest
```

In another terminal, from the repo root

```bash
cd src/SIL.XForge.Scripture/
dotnet run --start-ng-serve=no
```

**!!! IMPORTANT !!!** When you have finished testing, remove the built app `dist` folder. From the repo root

```bash
rm -rf src/SIL.XForge.Scripture/ClientApp/dist
```

## Backend Development

Normally when you run `dotnet run` it starts `ng serve` for you. This works great if you are developing on the front end as it watches for file changes and reloads your browser once it has compiled.

If you are developing on the backend this works better

```bash
cd src/SIL.XForge.Scripture/
dotnet watch run --start-ng-serve=listen
```

In another terminal

```bash
cd src/SIL.XForge.Scripture/ClientApp/
ng serve
```

When files change on the backend it will compile the changes automatically and now `ng serve` won't re-start every time.

See the [Debugging](#debugging) section below for how to do this in **VS Code**.

### Model Changes

The Angular app has a dependency on the Node backend NPM package so that it has access to the model types. If the models are changed, the Angular app will not see the changes until the backend package is rebuilt. You can rebuild the backend by executing the following commands:

```bash
cd src/RealtimeServer/
npm run build
```

If a model change is made, then a corresponding data migration should be implemented in the Node backend. A data migration is implemented by following these steps:

1. Create a class that extends the `Migration` base class with the name `<collection>Migration<version>` in the appropriate collection migrations file. The version number in the class name should be left padded with zeroes for 6 digits. For example, if you are adding a user migration for schema version 10, then you would add the class `UserMigration000010` to the `src/RealtimeServer/common/services/user-migrations.ts` file.
2. Implement the `migrateDoc` method. The `submitMigrationOp` function MUST be used to submit any migration changes to the doc.
3. Implement the `migrateOp` method.
4. Add the class to the migrations array in the migrations file.

## Debugging

In Visual Studio Code, in the debug sidebar, choose **Full App (SF)** to debug the front-end and back-end at the same time, or **Launch Chrome (SF)** or **.NET Core (SF)** to just debug the front-end or back-end.

## Database

The VS Code extension [Azure Cosmos DB](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-cosmosdb) can be used to inspect our Mongo DB.
