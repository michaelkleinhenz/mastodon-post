#!/bin/bash

APIID=$(aws cloudformation describe-stack-resource --stack-name mastodonpost --logical-resource-id api --query 'StackResourceDetail.PhysicalResourceId' --output text)
REGION=$(aws configure get region)

curl -X POST -H 'Content-Type: application/json' -d '{"mastodonhost":"https://bonn.social","token":"YOUR_TOKEN","caption":"YOUR_CAPTION","imgurl":"https://nodejs.org/static/legacy/images/logo.png"}' https://$APIID.execute-api.$REGION.amazonaws.com/api/post -v
