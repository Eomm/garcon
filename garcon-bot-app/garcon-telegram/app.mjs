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
  const telegramMsg = JSON.parse(event.body)
  if (String(telegramMsg?.message?.chat?.id) !== process.env.TELEGRAM_CHAT_ID) {
    return {
      statusCode: 403,
      body: 'FORBIDDEN'
    }
  }

  console.log('Forwarding command to GitHub Actions')
  await triggerGitHubWorkflow({ json_msg: event.body }, process.env.GH_WORKFLOW_URL, process.env.GH_TOKEN)
  return {
    statusCode: 200,
    body: 'OK'
  }
}

async function triggerGitHubWorkflow (inputs, ghaWorkflow, ghaToken) {
  const data = {
    ref: 'main',
    inputs
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
}
