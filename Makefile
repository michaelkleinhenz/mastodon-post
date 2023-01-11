help:
	@fgrep -h "##" $(MAKEFILE_LIST) | fgrep -v fgrep | sed -e 's/\\$$//' | sed -e 's/##//'

createbucket: ## create s3 bucket for lambda artifacts
	@echo "creating s3 bucket"
	$(eval $@_BUCKET_ID := $(shell dd if=/dev/random bs=8 count=1 2>/dev/null | od -An -tx1 | tr -d ' \t\n'))
	$(eval $@_BUCKET_NAME := lambda-artifacts-$($@_BUCKET_ID))
	@echo $($@_BUCKET_NAME) > bucket-name.txt
	@aws s3 mb s3://$($@_BUCKET_NAME)

deploy: ## deploy/update lambda function
	$(eval $@_ARTIFACT_BUCKET := $(shell cat bucket-name.txt))
	@echo "deploying to s3 bucket: $($@_ARTIFACT_BUCKET)"
	@aws cloudformation package --template-file template.yml --s3-bucket $($@_ARTIFACT_BUCKET) --output-template-file out.yml
	@aws cloudformation deploy --template-file out.yml --stack-name mastodonpost --capabilities CAPABILITY_NAMED_IAM

test: ## test lambda function with data from testrequest.json
	$(eval $@_APIID := $(shell aws cloudformation describe-stack-resource --stack-name mastodonpost --logical-resource-id api --query 'StackResourceDetail.PhysicalResourceId' --output text))
	$(eval $@_REGION := $(shell aws configure get region))
	@echo curl -X POST -H 'Content-Type: application/json' -d '@testrequest.json' https://$($@_APIID).execute-api.$($@_REGION).amazonaws.com/api/post -v

unittest: ## run unit tests
	@echo "running unit tests"
	@npm test --prefix ./function
