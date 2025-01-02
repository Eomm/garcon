'use strict'

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */
export const lambdaHandler = async (event, context) => {
  // TODO check the chat id
  console.log('Received event:')
  console.log(JSON.stringify(event, null, 2))
  console.log(`Chat ID: ${process.env.TELEGRAM_CHAT_ID}`)

  // TODO check the command
  const command = 'download-tdg'

  await triggerGitHubWorkflow(command, process.env.GH_WORKFLOW_URL, process.env.GH_TOKEN)
  return {
    statusCode: 200,
    body: 'OK'
  }
}

async function triggerGitHubWorkflow (command, ghaWorkflow, ghaToken) {
  const data = {
    ref: 'main',
    inputs: {
      command,
      dry_run: 'true' // TODO disable dry_run
    }
  }

  const response = await fetch(ghaWorkflow, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${ghaToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return response.json()
}
