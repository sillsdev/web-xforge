# web-xforge <!-- omit in toc -->

## Users

To use **Scripture Forge** go to [scriptureforge.org](https://scriptureforge.org).

To use **Language Forge** go to [languageforge.org](https://languageforge.org).

### Report problems

To report an issue with the **Scripture Forge** application, email "scriptureforgeissues @ sil dot org".

To report an issue with the **Language Forge** application, email "languageforgeissues @ sil dot org".

## Contents <!-- omit in toc -->

<!-- The table of contents is automatically updated by VSCode extension
"yzhang.markdown-all-in-one" when saving. -->

- [Users](#users)
  - [Report problems](#report-problems)
- [Build status](#build-status)
- [Development documentation](#development-documentation)
- [Special Thanks To](#special-thanks-to)

## Build status

Status of builds from our continuous integration (CI) [server](https://build.palaso.org):

| Site            | Master Unit                                                                                                                                                                                                                                                                                                                                               | QA                                                                                                                                                                                                                                            | Live                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scripture Forge | [![Build Status](<https://build.palaso.org/app/rest/builds/buildType:(id:SFv2_ScriptureForgeMasterUnitTests)/statusIcon>)](https://build.palaso.org/viewType.html?buildTypeId=SFv2_ScriptureForgeMasterUnitTests) [![Codecov](https://img.shields.io/codecov/c/github/sillsdev/web-xforge.svg?style=flat)](https://app.codecov.io/gh/sillsdev/web-xforge) | ![Build Status](<https://build.palaso.org/app/rest/builds/buildType:(id:xForgeDeploy_ScriptureForgeQa)/statusIcon>) ![Website](https://img.shields.io/website?down_message=offline&up_message=online&url=https%3A%2F%2Fqa.scriptureforge.org) | ![Build Status](<https://build.palaso.org/app/rest/builds/buildType:(id:xForgeDeploy_ScriptureForgeLive)/statusIcon>) ![Website](https://img.shields.io/website?down_message=offline&up_message=online&url=https%3A%2F%2Fscriptureforge.org) |

Successful builds from our CI server deploy to:

| Site            | QA                                                     | Live                                             |
| --------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Scripture Forge | [qa.scriptureforge.org](https://qa.scriptureforge.org) | [scriptureforge.org](https://scriptureforge.org) |

## Development documentation

See the [wiki](https://github.com/sillsdev/web-xforge/wiki) for development documentation.

This repository is for Scripture Forge v2+. See also the [repository](https://github.com/sillsdev/web-languageforge) for Language Forge and Scripture Forge v1.

## Special Thanks To

For end-to-end test automation:

[![BrowserStack Logo](readme_images/browserstack-logo.png "BrowserStack")](https://www.browserstack.com/)

For error reporting:

[![Bugsnag logo](readme_images/bugsnag-logo.png "Bugsnag")](https://bugsnag.com/blog/bugsnag-loves-open-source)
