
# Post Image to Mastodon

This is a simple AWS Lambda function that posts an image with caption to Mastodon. It is intended to be used with AWS API Gateway and AWS S3. It provides this functionality in one single API call. The Mastodon API itself requires two seperate API calls to post an image with caption (one to upload the image and one to post the image with caption).

This function can be used with automation services like IFTTT to post images with caption to Mastodon, enabling easy crossposing from Twitter or Instagram.

# Contents

- `function` - The Lambda function.
- `template.yml` - An AWS CloudFormation template that creates an application.
- `1-create-bucket.sh`, `2-deploy.sh`, etc. - Shell scripts that use the AWS CLI to deploy and manage the application.

Use the following instructions to deploy the sample application.

# Requirements

- [Node.js 10 with npm](https://nodejs.org/en/download/releases/)
- The Bash shell. For Linux and macOS, this is included by default. In Windows 10, you can install the [Windows Subsystem for Linux](https://docs.microsoft.com/en-us/windows/wsl/install-win10) to get a Windows-integrated version of Ubuntu and Bash.
- [The AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) v1.17 or newer.

If you use the AWS CLI v2, add the following to your [configuration file](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) (`~/.aws/config`):

```
cli_binary_format=raw-in-base64-out
```

This setting enables the AWS CLI v2 to load JSON events from a file, matching the v1 behavior.

Make sure your AWS credentials are set correctly, for example using environment variables:

```
export AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
export AWS_SECRET_ACCESS_KEY=YOUR_SECRET
export AWS_DEFAULT_REGION=YOUR_REGION
```

# Setup

Download or clone this repository.

    $ git clone https://github.com/michaelkleinhenz/mastodon-post.git
    $ cd mastodon-post

Install dependencies.

    $ cd function
    $ npm install
    $ cd ..

To create a new bucket for deployment artifacts, run `1-create-bucket.sh`.

    mastodon-post$ ./1-create-bucket.sh
    make_bucket: lambda-artifacts-a5e491dbb5b22e0d

# Deploy

To deploy the application, run `2-deploy.sh`.

    mastodon-post$ ./2-deploy.sh
    added 16 packages from 18 contributors and audited 18 packages in 0.926s
    added 17 packages from 19 contributors and audited 19 packages in 0.916s
    Uploading to e678bc216e6a0d510d661ca9ae2fd941  2737254 / 2737254.0  (100.00%)
    Successfully packaged artifacts and wrote output template to file out.yml.
    Waiting for changeset to be created..
    Waiting for stack create/update to complete
    Successfully created/updated stack - mastodon-post

This script uses AWS CloudFormation to deploy the Lambda functions and an IAM role. If the AWS CloudFormation stack that contains the resources already exists, the script updates it with any changes to the template or function code.

# Test

To invoke the function with the REST API, run the `4-get.sh` script. This script uses cURL to send a GET request to the API endpoint. Make sure you update the argument values given in the script.

You can also run the function locally using AWS SAM. Details can be found in the launch configuration in the .vscode folder. Refer also to the [AWS SAM documentation](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-using-debugging.html).

**Note:** if using Fedora and want to debug using AWS SAM, you need to disable selinux for docker to work properly. See
https://github.com/aws/aws-sam-cli/issues/2360 for details.

Finally, view the application in the Lambda console.

*To view the application*
1. Open the [applications page](https://console.aws.amazon.com/lambda/home#/applications) in the Lambda console.
2. Choose **mastodon-post**.

# Usage

The function expects a JSON POST request with the following body:

```
{
  "mastodonhost": "https://your.mastodon.instance",
  "token": "YOUR_TOKEN",
  "caption": "YOUR_TEXT_CAPTION",
  "imgurl": "IMAGE_URL"
}
```

Make sure the `mastodonhost` is the full URL of your Mastodon instance, including the protocol (https://). The `token` is the access token of your Mastodon account. You can generate one in the Mastodon web interface under Settings > Development > New Application. The `caption` is the text that will be posted with the image. The `imgurl` is the URL of the image that will be posted. The image must be publicly accessible.
