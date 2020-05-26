/* eslint-disable node/no-unpublished-require */

//const testingError = require('./testingError')

require('dotenv').config()

module.exports = function runPlugin(inputs) {
  const input = inputs
  // {
  //   skipTests: inputs.skipTests || false,
  //   skipStatusUpdate: inputs.skipStatusUpdate || false,
  //   testFailureErrorMessage:
  //     inputs.testFailureErrorMessage || 'Command failed with exit code 1',
  // }
  if (input.skipTests) {
    return {
      onInit: async () => {
        console.log(
          `Skipping tests due to configured plugin input "skipTests" !\nBuilding will continue ...`,
        )
      },
    }
  } else {
    return {
      onPreBuild: async ({ constants, utils }) => {
        constants.GITHUB_USER = process.env.GITHUB_USER
        constants.COMMIT_REF = process.env.COMMIT_REF
        constants.BRANCH = process.env.BRANCH
        constants.HEAD = process.env.HEAD
        constants.CACHED_COMMIT_REF = process.env.CACHED_COMMIT_REF
        constants.PULL_REQUEST = process.env.PULL_REQUEST
        constants.REVIEW_ID = process.env.REVIEW_ID
        constants.TEST_FAIL_ERROR_MESSAGE = input.testFailureErrorMessage
        constants.SKIP_STATUS = input.skipStatusUpdate
        if (process.env.REPOSITORY_URL) {
          constants.REPOSITORY = process.env.REPOSITORY_URL.replace(
            'https://github.com/',
            '',
          )
        }
        console.log('onPreBuild: I run_before_ build commands are executed')
        console.log(
          `Let's try to run some tests! Set Github status to "pending".... on ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
        )
        console.log(constants)
        try {
          await utils.run('jest', [
            '--json',
            '--outputFile',
            'jest.results.json',
          ])
          //console.log({ stdout, stderr, exitCode })

          // if (false)
          //   throw new Error(`The plugin had a true error, not a testing error.`)
          // if (false) throw new testingError('Test Not Passed.')
          // else
          console.log(
            `Hey all tests passed. Set Github status to "success"... to ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
          )
        } catch (error) {
          if (error.name != 'Error') {
            utils.build.failBuild(
              `Build failed because known error caught (${error.name}). Set Github status to "failed"... with some info:\n"${error.message}"\n to ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
            )
          } else if (
            error.message.indexOf(constants.TEST_FAIL_ERROR_MESSAGE) >= 0
          ) {
            // error.name = Error is generic can be failed tests or unknown error, everything else is a defined error
            utils.build.cancelBuild(
              `"${error.name}" found trying to run tests, build will be cancelled! Set Github status to "failed"...with a message:\n"${error.message}"\n or something.to ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
            )
          } else {
            utils.build.failBuild(
              `"${error.name}" found trying to run tests, build will be failed! Set Github status to "failed"...with a message:\n"${error.message}"\n or something.to ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
            )
          }
        }
      },
    }
  }
}
