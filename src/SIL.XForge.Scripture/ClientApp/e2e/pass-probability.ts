import testCharacterization from './test_characterization.json' with { type: 'json' };

function probabilityOfRegressionGivenPreviousFailureRates(
  initialRuns: number,
  initialFailures: number,
  newFailures: number
): number {
  if (initialFailures > initialRuns) throw new Error('initialFailures must be less than or equal to initialRuns');

  // Adding 1 to both the numerator and denominator provides a better estimate of the actual failure rate.
  // If you read explanations of Bayesian statistics, you'll see 1 added when calculating a prior. Just to be clear, I
  // don't understand Bayesian statistics *at all*, but it's actually quite intuitive if you consider the following
  // scenario:
  // A test is run 5 times, with zero failures. Which of the following statements is better supported?
  // - The pass rate is 100%
  // - The failure rate is below 20%
  // This calculation results in an expected failure rate of 16.67%. Essentially we're starting with an assumption that
  // the failure rate is 50%, then adding data to refine that assumption.

  const oldFailureRate = initialRuns === 0 ? 0.5 : (initialFailures + 1) / (initialRuns + 1);
  const probabilityOfNewFailuresUnderOldFailureRate = Math.pow(oldFailureRate, newFailures);
  return 1 - probabilityOfNewFailuresUnderOldFailureRate;
}

/**
 * This function answers the question, "If I originally ran a test N times and saw only F failures, but now the test is
 * failing, how many times in a row do I need to see it fail to be X% confident that it's a real regression and not a
 * random failure?"
 *
 * Keep in mind:
 * - Even if zero failures were originally observed, that does not mean a single failure is enough to be sure it's a
 * real regression.
 * - This isn't really calculating the probability of a regression, but the probability that some factor not present
 * during the original runs is increasing the failure rate (for example, the CPU on the build server is slower than
 * the machine that ran the original tests to get the baseline failure rate).
 */
function numberOfRunsNeededToAchieveDesiredProbabilityOfRegression(
  initialRuns: number,
  initialFailures: number,
  desiredProbabilityOfRegression: number
): number {
  if (initialFailures === initialRuns) return Infinity;
  for (let i = 1; ; i++) {
    if (
      probabilityOfRegressionGivenPreviousFailureRates(initialRuns, initialFailures, i) > desiredProbabilityOfRegression
    ) {
      return i;
    }
  }
}

const tolerableFalseFailuresPerYearAcrossAllTests = 12;
const numberOfTests = Object.keys(testCharacterization).length;
const tolerableFalseFailuresPerYear = tolerableFalseFailuresPerYearAcrossAllTests / numberOfTests;

const workflowRunsPerYear = 3_599; // Number of runs of build-and-test.yml in the past year at time of writing
const tolerableMeanRunsBetweenFailures = workflowRunsPerYear / tolerableFalseFailuresPerYear;
// This works out fairly close to three nines of reliability
const tolerableSuccessRateForEachTestWithRetries = Math.pow(0.5, 1 / tolerableMeanRunsBetweenFailures);

/**
 * Calculates the number of times a test should be attempted before considering it a failure. This is based on past
 * failure rates, and the acceptable number of false failures we can tolerate.
 *
 * In practice, this is not only to tell us how many times a test should be re-run, but also an indication of whether a
 * test is reliable enough (a test that we can be 99.9% certain has regressed when it fails twice in a row is fairly
 * reliable. A test that has to be run 5 times to reach that level of certainty indicates a problem we need to deal
 * with).
 * @param test The name of the test to check.
 * @param characterization The test characterization data. This is used to determine the number of runs and failures
 * for the test. If not provided, the values imported from the saved JSON file will be used (the parameter only needs
 * to be passed when recalculating values due to them changing while the script is running).
 */
export function numberOfTimesToAttemptTest(
  test: keyof typeof testCharacterization,
  characterization = testCharacterization
): number {
  const characteristics = characterization[test];

  return numberOfRunsNeededToAchieveDesiredProbabilityOfRegression(
    characteristics.success + characteristics.failure,
    characteristics.failure,
    tolerableSuccessRateForEachTestWithRetries
  );
}
