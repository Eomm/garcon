# garcon

[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)

My personal bot


## Actions

Each action is a boring task that I don't want to do. I automate it with this bot.

### download-tdg

Download my favorite free magazine from [https://www.terradeigiochi.it/1039-tdg-magazine](https://www.terradeigiochi.it/1039-tdg-magazine)

| Environment variable | Description | Default value |
| --- | --- | --- |
| `TDG_USER` | Username to login to the website | |
| `TDG_PASSWORD` | Password to login to the website | |
| `TDG_ARTIFACT_NAME` | File name of the downloaded file | `tdg.pdf` |
| `TDG_FILTER` | Filter to select the correct download link | Latest megazine |
| `TDG_HEADLESS` | Run the browser in headless mode | `true` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | |
| `TELEGRAM_CHAT_ID` | Chat id where the bot will send the downloaded file | |

Run locally with:

```sh
node --env-file=.env index.js download-tdg
```

## Configuration

### Telegram

The actions are designed to submit the results to a Telegram chat. To do this, you need to:
1. Create a Telegram bot with BotFather and get the token
2. Get the chat id where the bot will send the messages

To get the chat id quickly and locally, you can use the following code:

```sh
# Start the bot
node --env-file=.env bin/telegram-find-chat-id.js

# Send a message to the bot in the chat you want to use
# The bot will reply with the chat id in the console and in the chat
```

## License

Copyright [Manuel Spigolon](https://github.com/Eomm), Licensed under [MIT](./LICENSE).
