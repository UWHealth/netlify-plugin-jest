class testingError extends Error {
  constructor(message) {
    super(message)

    this.name = this.constructor.name

    //Add logic to receive/parse Jest testing results
  }
}

module.exports = testingError
