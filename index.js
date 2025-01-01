'use strict'

const assert = require('node:assert')
const { action: downloadTDG } = require('./actions/download-tdg')

async function run (args, env) {
  const action = args[0]

  switch (action) {
    case 'download-tdg':
      assert.ok(env.TDG_USER, 'TDG_USER is required')
      assert.ok(env.TDG_PASSWORD, 'TDG_PASSWORD is required')
      await downloadTDG(args, env)
      break
    default:
      throw new Error(`Action ${action} not found`)
  }
}

run(process.argv.slice(2), process.env)
  .then(() => console.log('Done'))
  .catch(error => console.error('Error:', error))
