/* eslint-disable node/no-unpublished-require */

require('dotenv').config()

const statuses = {
  FAIL: 'failed',
  PEND: 'pending',
  GOOD: 'success',
}

function getRepoURL() {
  if (process.env.REPOSITORY_URL) {
    return process.env.REPOSITORY_URL.replace('https://github.com/', '')
  }
  return
}

function getBuildLogURL(siteName) {
  return `https://app.netlify.com/sites/${siteName}/deploys/${metadata.build.BUILD_ID}`
}

const metadata = {
  build: {
    NETLIFY: process.env.NETLIFY,
    BUILD_ID: process.env.BUILD_ID || '',
    CONTEXT: process.env.CONTEXT,
  },
  git: {
    REPOSITORY: getRepoURL(),
    GITHUB_USER: process.env.GITHUB_USER,
    COMMIT_REF: process.env.COMMIT_REF,
    BRANCH: process.env.BRANCH,
    HEAD: process.env.HEAD,
    CACHED_COMMIT_REF: process.env.CACHED_COMMIT_REF,
    PULL_REQUEST: process.env.PULL_REQUEST,
    REVIEW_ID: process.env.REVIEW_ID,
  },
}

function manageGHStatus(validInputs, status, message) {
  console.log(
    `Status: ${validInputs.gitHubStatusName}, will be set to ${
      statuses[status]
    } with the message: ${message}, and link to ${getBuildLogURL(
      validInputs.siteName,
    )}`,
  )
  console.log(metadata)
  console.log(validInputs)
  return
}

module.exports = function runPlugin(inputs) {
  const validInputs = {
    skipTests: inputs.skipTests || false,
    skipStatusUpdate: inputs.skipStatusUpdate || false,
    testFailureErrorMessage:
      inputs.testFailureErrorMessage || 'Command failed with exit code 1',
    gitHubStatusName: inputs.gitHubStatusName || 'Jest Tests',
    siteName: inputs.siteName,
  }
  if (validInputs.skipTests) {
    return {
      onInit: async ({ inputs }) => {
        console.log(
          `Skipping tests due to configured plugin input "skipTests" !\nBuilding will continue ...`,
        )
        console.log(inputs)
      },
    }
  } else {
    return {
      onPreBuild: async ({ constants, utils }) => {
        manageGHStatus(validInputs, 'PEND', `Running ...`)
        // console.log(constants)
        try {
          await utils.run('jest', [
            '--json',
            '--outputFile',
            'jest.results.json',
          ])

          manageGHStatus(validInputs, 'GOOD', `X Tests Passed.`)
        } catch (error) {
          if (error.name != 'Error') {
            manageGHStatus(
              validInputs,
              'FAIL',
              `Plugin failed: (${error.name}. See Details for error message.`,
            )
            utils.build.failBuild(
              `Build failed because known error caught (${error.name}). Set Github status to "failed"... with some info:\n"${error.message}"\n to ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
            )
          } else if (
            error.message.indexOf(validInputs.testFailureErrorMessage) >= 0
          ) {
            // error.name = Error is generic can be failed tests or unknown error, everything else is a defined error
            manageGHStatus(validInputs, 'FAIL', `X tests failed`)
            utils.build.cancelBuild(
              `"${error.name}" found, probably failed tests, build will be cancelled!\n.to ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
            )
          } else {
            manageGHStatus(
              validInputs,
              'FAIL',
              `Plugin failed with generic error. See Details for error message.`,
            )
            utils.build.failBuild(
              `"${error.name}" found trying to run tests, build will be failed! Set Github status to "failed"...with a message:\n"${error.message}"\n or something.to ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
            )
          }
        }
      },
    }
  }
}
