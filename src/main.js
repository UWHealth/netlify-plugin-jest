require('dotenv').config()
const fs = require('fs')
const { Octokit } = require('@octokit/rest')

const statuses = {
  FAIL: 'failure',
  PEND: 'pending',
  GOOD: 'success',
  ERROR: 'error',
}
const metadata = {
  build: {
    NETLIFY: process.env.NETLIFY,
    BUILD_ID: process.env.BUILD_ID || '',
    CONTEXT: process.env.CONTEXT,
    DEPLOY_URL: process.env.DEPLOY_URL,
    DEPLOY_ID: process.env.DEPLOY_ID || '',
  },
  git: {
    OWNER: getRepoURL()[0],
    REPO: getRepoURL()[1],
    COMMIT_REF: process.env.COMMIT_REF,
    BRANCH: process.env.BRANCH,
    HEAD: process.env.HEAD,
    CACHED_COMMIT_REF: process.env.CACHED_COMMIT_REF,
    PULL_REQUEST: process.env.PULL_REQUEST,
    REVIEW_ID: process.env.REVIEW_ID,
  },
}

function getRepoURL() {
  if (process.env.REPOSITORY_URL) {
    let url = process.env.REPOSITORY_URL.replace('https://github.com/', '')
    return url.split('/')
  }
  return
}

if (!process.env.GITHUB_PERSONAL_TOKEN) {
  throw new Error('GITHUB_PERSONAL_TOKEN Environment variable required.')
}

const octokit = new Octokit({
  auth: process.env.GITHUB_PERSONAL_TOKEN,
  userAgent: `netlify-plugin-jest - ${metadata.build.DEPLOY_ID} - `,
})

function getBuildLogURL() {
  if (metadata.build.DEPLOY_URL) {
    const siteName = metadata.build.DEPLOY_URL.split('--')[1].replace(
      '.netlify.app',
      '',
    )
    return `https://app.netlify.com/sites/${siteName}/deploys/${metadata.build.DEPLOY_ID}`
  } else {
    return `https://app.netlify.com/`
  }
}

async function makeStatusSummary() {
  // read jest.results.json and extract data
  return new Promise((resolve, reject) => {
    fs.readFile('jest.results.json', 'utf8', function (err, data) {
      if (err) {
        reject(err)
      }
      const results = JSON.parse(data)
      // console.log(JSON.stringify(results, undefined, 2))
      resolve(
        `Tests: ${results.numPassedTests}/${results.numTotalTests}, Suites: ${results.numPassedTestSuites}/${results.numTotalTestSuites} passing`,
      )
    })
  })
}

async function manageGHStatus(inputs, status, message) {
  if (inputs.extraLogging) {
    console.log(
      `\n\nStatus: ${inputs.gitHubStatusName}, will be set to ${
        statuses[status]
      } with the message: ${message}, and link to ${getBuildLogURL()}\n\n`,
    )
  }
  const resp = await octokit.repos.createStatus({
    owner: metadata.git.OWNER,
    repo: metadata.git.REPO,
    sha: metadata.git.COMMIT_REF,
    state: statuses[status],
    target_url: getBuildLogURL(),
    description: message,
    context: inputs.gitHubStatusName,
  })
  //const resp = JSON.parse(response)
  console.log(
    `\n\nResponse from setting GitHub repo Status for ${resp.data.context} (${resp.data.updated_at}):\n  http status: ${resp.status}, state: ${resp.data.state}, description: "${resp.data.description}"\n\n`,
  )

  return
}

module.exports = function runPlugin(inputs) {
  if (inputs.skipTests) {
    return {
      onPreBuild: async ({ inputs }) => {
        console.log(
          `\n\nSkipping tests due to configured plugin input "skipTests" !\nBuilding will continue ...\n`,
        )
        if (inputs.extraLogging) {
          console.log(`Plugin inputs:`)
          console.log(inputs)
        }
      },
    }
  } else {
    return {
      onPreBuild: async ({ constants, utils, inputs }) => {
        if (inputs.extraLogging) {
          console.log(`Plugin metadata from environemnt:`)
          console.log(metadata)
          console.log(`Plugin inputs:`)
          console.log(inputs)
          console.log(`Plugin constants:`)
          console.log(constants)
        }

        await manageGHStatus(inputs, 'PEND', `Running ...`)
        try {
          await utils.run.command(inputs.testCommand)
          const message = await makeStatusSummary()
          await manageGHStatus(inputs, 'GOOD', message)
        } catch (error) {
          if (error.name != 'Error') {
            const message = `Plugin failed: (${error.name}. See Details for error message.`
            await manageGHStatus(inputs, 'ERROR', message)
            utils.build.failBuild(
              `Build failed because known error type caught (${error.name}). Set Github status to "failed"... with some info:\n"${error.message}"\n`,
            )
          } else if (
            error.message.indexOf(inputs.testFailureErrorMessage) >= 0
          ) {
            // error.name = Error is generic can be failed tests or unknown error, everything else is a defined error
            const message = await makeStatusSummary()
            await manageGHStatus(inputs, 'FAIL', message)
            utils.build.cancelBuild(
              `"${error.name}" found, probably failed tests, build will be cancelled!`,
            )
          } else {
            const message = `Plugin failed with generic error. See Details for error message.`
            await manageGHStatus(inputs, 'ERROR', message)
            utils.build.failBuild(
              `"${error.name}" found trying to run tests, build will be failed! Set Github status to "failed"...with a message:\n"${error.message}"`,
            )
          }
        }
      },
    }
  }
}
