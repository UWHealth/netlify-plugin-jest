/* eslint-disable node/no-unpublished-require */

const testingError = require('./testingError')

require('dotenv').config()

module.exports = function runPlugin(inputs) {
  if (inputs.skipTests) {
    return {
      onInit: () => {
        console.log(
          `Skipping tests due to configured plugin input "skipTests" !\nBuilding will continue ...`,
        )
      },
    }
  } else {
    return {
      onPreBuild: ({ constants, utils }) => {
        constants.GITHUB_USER = process.env.GITHUB_USER
        constants.COMMIT_REF = process.env.COMMIT_REF
        constants.REPOSITORY = process.env.REPOSITORY_URL.replace(
          'https://github.com/',
          '',
        )
        console.log('onPreBuild: I run_before_ build commands are executed')
        console.log(
          `Let's try to run some tests! Set Github status to "pending".... on ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
        )
        console.log(constants)
        try {
          if (false)
            throw new Error(`The plugin had a true error, not a testing error.`)
          if (true) throw new testingError('Test Not Passed.')
          else
            console.log(
              `Hey all tests passed. Set Github status to "success"...`,
            )
        } catch (error) {
          console.log(`Error: ${error.name}. Message: ${error.message}`)
          if (error instanceof testingError) {
            utils.build.cancelBuild(
              `Build cancelled because tests failed. Set Github status to "failed"... with some tests info. to ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
            )
          } else {
            utils.build.failBuild(
              `${error.name} found trying to run tests, build will fail! Set Github status to "failed"...with a message or something.to ${constants.REPOSITORY}/${constants.COMMIT_REF}`,
              error.message,
            )
          }
        }
      },
    }
  }
}
