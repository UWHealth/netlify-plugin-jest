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
    SITE_NAME: process.env.SITE_NAME,
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

let EXTRA_LOGGING = false

function getRepoURL() {
  if (process.env.REPOSITORY_URL) {
    let url = process.env.REPOSITORY_URL.replace('https://github.com/', '')
    return url.split('/')
  }
  return ['', '']
}

if (!process.env.GITHUB_PERSONAL_TOKEN) {
  throw new Error('GITHUB_PERSONAL_TOKEN Environment variable required.')
}

function getBuildLogURL() {
  if (metadata.build.DEPLOY_URL) {
    let siteName = metadata.build.DEPLOY_URL.split('--')[1]
    siteName = siteName.replace('.netlify.app', '')
    return `https://app.netlify.com/sites/${siteName}/deploys/${metadata.build.DEPLOY_ID}`
  } else {
    return `https://app.netlify.com/`
  }
}

async function makeStatusSummary(inputs) {
  // read jest.results.json and extract data
  return new Promise((resolve, reject) => {
    fs.readFile('jest.results.json', 'utf8', function (err, data) {
      if (err) {
        reject(err)
      }
      const results = JSON.parse(data)
      if (EXTRA_LOGGING) {
        console.log(JSON.stringify(results, undefined, 2))
      }
      resolve(
        `Tests: ${results.numPassedTests}/${results.numTotalTests}, Suites: ${results.numPassedTestSuites}/${results.numTotalTestSuites} passing`,
      )
    })
  })
}

async function manageGHStatus(inputs, status, message) {
  if (EXTRA_LOGGING) {
    console.log(
      `\n\nStatus: ${inputs.gitHubStatusName}, will be set to ${
        statuses[status]
      } with the message: ${message}, and link to ${getBuildLogURL()}\n\n`,
    )
  }
  if (!inputs.skipStatusUpdate) {
    const octokit = new Octokit({
      auth: process.env.GITHUB_PERSONAL_TOKEN,
      userAgent: `netlify-plugin-jest - ${metadata.build.DEPLOY_ID} - `,
    })

    const resp = await octokit.repos.createCommitStatus({
      owner: metadata.git.OWNER,
      repo: metadata.git.REPO,
      sha: metadata.git.COMMIT_REF,
      state: statuses[status],
      target_url: getBuildLogURL(),
      description: message,
      context: inputs.gitHubStatusName,
    })
    if (EXTRA_LOGGING) {
      console.log(
        `\n\nResponse from setting GitHub repo Status for ${resp.data.context} (${resp.data.updated_at}):\n  http status: ${resp.status}, state: ${resp.data.state}, description: "${resp.data.description}"\n\n`,
      )
    }
  } else {
    console.log(
      `GitHub Status updated skipped based on input paramter "skipStatusUpdate"`,
    )
  }
  return
}

module.exports = function runPlugin(inputs) {
  EXTRA_LOGGING =
    process.env.NETLIFY_PLUGIN_JEST_EXTRA_LOGGING || inputs.extraLogging
  let githubStatusIsPending = false
  let pluginError = false
  if (inputs.skipTests) {
    return {
      onPreBuild: async () => {
        if (inputs.skipTests) {
          console.log(
            `\nSkipping tests due to configured plugin input "skipTests" !\nBuilding will continue ...\n`,
          )
        }
        if (EXTRA_LOGGING) {
          console.log(`Plugin inputs:`)
          console.log(inputs)
        }
      },
    }
  } else {
    return {
      onPreBuild: async ({ utils }) => {
        const commitCount = utils.git.commits.length || 0
        if (EXTRA_LOGGING) {
          console.log(`utils.git:`)
          console.log(utils.git)
          console.log(`Plugin metadata from environemnt:`)
          console.log(metadata)
          console.log(`Plugin inputs:`)
          console.log(inputs)
        }

        if (commitCount > 0) {
          console.log(
            `${commitCount} or more commits have occured. Tests proceeding ...\n`,
          )
          try {
            await manageGHStatus(inputs, 'PEND', `Running ...`)
            githubStatusIsPending = true
          } catch (error) {
            pluginError = true
            await utils.build.failBuild(
              `Build failed to set initial GitHub status to pending.\n${error.name}:\n"${error.message}"\n`,
            )
          }

          try {
            await utils.run.command(inputs.testCommand)
            const message = await makeStatusSummary(inputs)
            await manageGHStatus(inputs, 'GOOD', message)
            // clear flag
            githubStatusIsPending = false
          } catch (error) {
            if (error.name != 'Error') {
              const message = `Plugin failed: ${error.name}. See Details for error message.`
              await manageGHStatus(inputs, 'ERROR', message)
              githubStatusIsPending = false
              pluginError = true
              await utils.build.failBuild(
                `Build failed because known error type caught (${error.name}). Set Github status to "failed"... with some info:\n"${error.message}"\n`,
              )
            } else if (
              error.message.indexOf(inputs.testFailureErrorMessage) >= 0
            ) {
              // error.name = Error is generic can be failed tests or unknown error, everything else is a defined error
              const message = await makeStatusSummary(inputs)
              await manageGHStatus(inputs, 'FAIL', message)
              githubStatusIsPending = false
              await utils.build.cancelBuild(
                `"${error.name}" found, probably failed tests, build will be cancelled!`,
              )
            } else {
              const message = `Plugin failed with generic error. See Details for error message.`
              await manageGHStatus(inputs, 'ERROR', message)
              githubStatusIsPending = false
              pluginError = true
              await utils.build.failBuild(
                `"${error.name}" found trying to run tests, build will be failed! Set Github status to "failed"...with a message:\n"${error.message}"`,
              )
            }
          }
        } else {
          console.log(
            `${commitCount} commits have occured. Tests are being automatically skipped.\nBuilding will continue ...\n`,
          )
        }
      },
      onError: async () => {
        // make sure other unhandled errors set the status to error, instead of hanging as "pending"
        // also githubStatusIsPending = true, means error during plugin operation
        if (githubStatusIsPending) {
          const message = `Plugin failed hard. See Details for error message.`
          console.error(message)
          await manageGHStatus(inputs, 'ERROR', message)
        } else {
          if (pluginError) {
            console.error(`Plugin error occurred!`)
          } else {
            console.error(`Build error occurred after tests run.`)
          }
        }
      },
    }
  }
}
