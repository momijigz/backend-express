const axios = require('axios');

const token = process.env.SLACK_TOKEN;

async function postSlackMessage(channel, text, config) {
  const slackRes = await axios({
    method: 'POST',
    url: 'https://slack.com/api/chat.postMessage',
    data: {
      channel,
      text,
      pretty: 1,
      mrkdwn: true,
      ...config
    },
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (slackRes.data.error) {
    throw new Error(`${slackRes.data.error}: ${slackRes.data.needed}`);
  }
}

exports.postSlackMessage = postSlackMessage;
