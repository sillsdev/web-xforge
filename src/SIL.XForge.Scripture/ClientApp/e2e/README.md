# Scripture Forge End-to-End Tests

## Setup

Install [Deno](https://deno.com/).

Playwright may need some dependencies installed. For example, on Ubuntu:

```bash
sudo apt install libavif-bin
```

Install other dependencies:

```bash
cd src/SIL.XForge.Scripture/ClientApp/e2e
npx playwright install
```

Populate file `secrets.json` with secrets for testing.

## Run

```bash
cd src/SIL.XForge.Scripture/ClientApp/e2e
./e2e.mts
```

## Testing philosophy

### The testing pyramid

The greater focus on integration tests rather than E2E tests in this version of Scripture Forge came from this Google
developer blog post: https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html

The main point is to use unit tests as much as possible, use integration tests for what unit tests can't cover, and use
E2E tests for what only E2E tests can cover. This is mainly because unit tests are faster, more reliable, and pinpoint
the source of the problem more accurately.

It's not that E2E tests are bad, but that they come with trade-offs that should be considered.

### A pyramid approach to the E2E tests themselves

While the article above focuses on different types of tests, the same principle can be applied to the E2E tests
themselves. Once a test is written, it may be possible to run that test across multiple browsers, viewport sizes,
localization languages, and depending on the test type, different user roles. Being able to test every possible
permutation of these variables is extremely powerful, but it also takes much longer to run (and the probability of
failure due to flakey tests increases).

Rather than choosing to always have a ton of tests or only a few tests, we can scale the number of tests based on the
situation. In general, we should run as many tests as possible without sacrificing efficiency. In general this means:

1. Pull requests should run as many E2E tests as can be run without slowing down the process (i.e. they need to be
   reliable and take no longer than the other checks that are run on pull requests)
2. Pull requests that make major changes should have more tests run (this could be a manual step or somehow configured
   in the CI by setting a tag on the pull request).
3. Release candidates should run as many tests as possible.

### Other goals

Instrumentation for E2E tests can be used for more than automated testing. We can also use it to create screenshots for
visual regression testing, and to keep screenshots in documentation up to date and localized. Some of this would incur
additional effort to implement, but the instrumentation should be designed with this future in mind.

## Implementation

Playwright is being used for the E2E tests. It comes with both a library for driving the browser, and a test runner. For
the most part, I have avoided using the test runner, opting instead to use the library directly. This gives a lot more
flexibility in controlling what tests are run. The Playwright test runner is powerful, allowing for permutations of
tests to be run, and multiple browsers run in parallel. However, there are also scenarios where more flexibility is
needed, such as when running smoke tests for each user role. The admin user needs to be able to create the share links
that are then used for invitations, having one test use the output of another.

I opted to use Deno rather than Node for the E2E tests, though this comes with some drawbacks (see the "Working with
Deno" section below).

There are two types of tests that have been created so far:

- Smoke tests: The tests log in as each user role, navigate to each page, and take a screenshot on each.
- Workflow: A specific workflow that a user may perform is tested from start to finish.

## Running tests

A test plan is defined in `e2e-globals.ts` as a "Preset". It defines which locales to test, which browser engines,
user roles, whether to take screenshots, etc. It also defines which categories of tests should be run (e.g. smoke tests,
generating a draft, community checking). When the tests are executed, the run sheet should be followed to the degree
that is possible. For example, the smoke tests should test only the user roles specified in the run sheet, but
certain tests are specific to a given role (for example, you have to be an admin to set up a community checking
project), and won't need to consider the specified roles.

To run the tests, make any necessary edits to the run sheet, then run `e2e.mts`.

Screenshots are saved in the `screenshots` directory, in a subfolder specified by the run sheet. The default subfolder
name is the timestamp when the tests started.

A file named `run_log.json` is saved to the directory with information about the test run and metadata regarding each of
the screenshots.

## Other notes

### Working with Deno

Unfortunately, I have not found a good way to make Deno play nicely with Node and Angular. In VS Code, I always run the
`Deno: Enable` command when working with files that will be run by Deno, and then run `Deno: Disable` when switching to
other TypeScript files. When Deno is disabled the language server complains about problems in the files intended to be
run by Deno, and when Deno is enabled the language server complains about problems in the other files.

Hopefully a better solution is available.

### Making utility functions wait for completion

A utility function that performs an action should also wait for for any side effects of the action to complete before
returning. For example, a function that deletes the current project should wait until the user is redirected to the my
projects page before returning. This can be done by waiting for the URL to change. This has two main benefits:

1. Whatever action runs next does not need to wait for the side effects of the previous action to complete.
2. When failures occur (such as if the redirect following the deletion doesn't happen), it's much easier to determine
   where things went wrong, because the failure will occur in the function where the problem originated.

### Recording tests

In general it does not work well to just record a test with Playwright and then consider it a finished test. However, it
can be much quicker to have Playwright record a test and then use that as a starting point. You can record a test by
running `npx playwright codegen`, or by calling `await page.pause()` in a test, which stops execution and opens a second
inspector window, which allows recording of tests, or using Playwright's locator tool.

## Future plans

Workflow tests that should be created:

- Community checking
- Editing, including simultaneous editing and change in network status
- Serval admins
- Site admins

Other use-cases for the E2E tests:

- Automated screenshot comparison
- Localized screenshots for documentation
- Help videos
