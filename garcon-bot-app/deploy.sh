!#/bin/bash
sam validate
sam build
sam deploy --parameter-overrides "`tr -s '\n' ' ' < .env`"