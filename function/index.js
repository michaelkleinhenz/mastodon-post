/*
 * This function is used to post an image to a mastodon instance.
 * Copyright (c) 2022 Michael Kleinhenz <michael@kleinhenz.net>.
 * Licensed under the MIT License.
 */

/*
Sample REST request:
  {
    'context': 'mastodon', // mastodon, twitter, instagram, schedule
    'postingHost': 'https://posting.host', // for IFTTT, this includes the token
    'postingToken': '1234567890', // only used for Mastodon
    'caption': 'This is a test caption',
    'imageURL': 'https://image.url/image.png',
    'postingTime': 1234567890  // epoch in seconds 
  }
*/

const FormData = require('form-data');
const axios = require('axios');
const AWS = require('aws-sdk');

const CONTEXT_INSTAGRAM = 'instagram';
const CONTEXT_TWITTER = 'twitter';
const CONTEXT_MASTODON = 'mastodon';
const CONTEXT_BLUESKY = 'bluesky';
const CONTEXT_SCHEDULER = 'schedule';

const maxCaptionLength = 500;
const hashTagOccurenceLimit = 2;
const filters = [
  { from: '@fizzblizz', to: '@Fizzblizz' },
];

const docClient = new AWS.DynamoDB.DocumentClient({
  region: 'us-west-1'
});

var testMode = false;

setTestMode = (mode) => {
  testMode = mode;
}

function guid() {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

const putScheduleDocument = (context, postingHost, postingToken, caption, imageURL, postingTime) => new Promise((resolve, reject) => {
  return docClient.put({
    TableName: 'scheduled-posts',
    Item: {
      id: guid(),
      context: context,
      postingHost: postingHost,
      postingToken: postingToken,
      caption: caption,
      imageURL: imageURL,
      postingTime: postingTime,
    }
  }).promise().then(() => {
    console.log('successfully scheduled status update to database');
    resolve();
  }).catch((err) => {
    console.log('error storing schedule document into database');
    console.log(err);
    reject(err);
  });
});

getScheduleDocumentsByTime = (context, postingTime) => new Promise((resolve, reject) => {
  console.log('getting schedule documents from database for context ' + context + ' and posting time ' + postingTime);
  return docClient.query({
    TableName: 'scheduled-posts',
    IndexName: 'context-index',
    KeyConditionExpression: 'context = :platformValue',
    ExpressionAttributeValues: { ':platformValue': context }
  }).promise().then((data) => {
    // the posting time is stored as a string in the database, so we need to do manual filtering here
    // TODO: switch to a number type in the database, use filterExpression here:
    // FilterExpression: 'postingTime <= :postingTimeValue'
    console.log('getting schedule documents from database, found records: ' + data.Items.length);
    console.log('filtering records by postingTime ' + postingTime);
    console.log(data);
    data.Items = data.Items.filter(item => parseInt(item.postingTime) <= postingTime);
    resolve(data);
  }).catch((err) => {
    console.log('error getting schedule document from database');
    if (err) {
      console.log(err);
      reject(err);
    } else
      reject('unknown error');
  });
});

const deleteScheduleDocument = (id) => new Promise((resolve, reject) => {
  return docClient.delete({
    TableName: 'scheduled-posts',
    Key: {
      id: id
    }
  }).promise().then((data) => {
    resolve(data);
  }).catch((err) => {
    console.log('error deleting schedule document from database');
    console.log(err);
    reject(err);
  });
});

const findHashtagStart = (text) => {
  if (!text) return -1;
  const words = text.split(' ');
  let idx = 0;
  let hashtagCount = 0;
  let previousWordLength = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith('#')) {
      hashtagCount++;
      if (hashtagCount == hashTagOccurenceLimit) {
        return idx - previousWordLength - 1;
      }
    } else {
      hashtagCount = 0;
    }
    idx += words[i].length + 1;
    previousWordLength = words[i].length;
  }
  return idx;
}

const extractCaptionBody = (text) => {
  if (!text) return '';
  let hashtagStart = findHashtagStart(text);
  return text.substring(0, hashtagStart).trim()
}

const extractHashTags = (text) => {
  if (!text) return [];
  let hashtagStart = findHashtagStart(text);
  let hashtagText = text.substring(hashtagStart, text.length).trim()
  return hashtagText.match(/#[^\s#\.\;]*/gmi);
};

const extractMentions = (text) => {
  if (!text) return [];
  return text.match(/@[^\s@]*/gmi);
};

const removeTextElements = (text, elements) => {
  if (!text) return text;
  elements.forEach(element => {
    text = text.replace(element, '');
  });
  return text.replace(/\s+/g, ' ');
}

const filterCaption = (text) => {
  if (!text) return text;
  filters.forEach(filter => {
    text = text.replace(filter.from, filter.to);
  });
  return text;
}

const shortenCaption = (text, maxLength) => {
  if (!text) return text;
  if (text.length <= maxLength) return text;
  // first parse caption
  let captionBody = filterCaption(extractCaptionBody(text));
  // if the body is already too long, force shorten it
  if (captionBody.length > maxLength) {
    let shortenedText = captionBody.substring(0, maxLength - 1);
    let lastDot = shortenedText.lastIndexOf('.');
    if (lastDot > 0) {
      let final = shortenedText.substring(0, lastDot) + '.';
      console.log('shortened caption by removing text after last dot, final length: ' + final.length);
      return final;
    }
    let final = shortenedText.substring(0, maxLength - 3) + '...';
    console.log('shortened caption by force removing text, final length: ' + final.length)
    return final;
  }
  // if not, add back hashtags as fit
  let hashtags = extractHashTags(text);
  hashtags.forEach(hashtag => {
    let newText = captionBody + ' ' + hashtag;
    if (newText.length <= maxLength) {
      captionBody = newText;
    }
  });
  console.log('added hashtags back to caption, final length: ' + captionBody.length);
  return captionBody;
}

const uploadImageMastodon = (mastodonURL, mastodonToken, imageUrl) => new Promise((resolve, reject) => {
  if (testMode) {
    console.log('test mode, skipping image upload of ' + imageUrl + ' to mastodon instance ' + mastodonURL + ' with token ' + mastodonToken);
    resolve('1234567890');
    return;
  };
  axios.get(imageUrl, { responseType: 'arraybuffer' }).then(async function (response) {
    console.log('got image with mime type ' + response.headers['content-type']);
    const formData = new FormData();
    formData.append('file', response.data, { filename: 'image', contentType: response.headers['content-type'] });
    try {
      const res = await axios.post(mastodonURL + '/api/v2/media', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': 'Bearer ' + mastodonToken,
        }
      });
      console.log('uploaded image to mastodon instance successful, id is ' + res.data.id);
      resolve(res.data.id);
    } catch (error) {
      console.log('failed to upload image to mastodon instance..');
      console.log(error);
      reject(error);
    };
  }).catch(function (error) {
    console.log('failed to fetch image from imageURL..');
    console.log(error);
    reject(error);
  });
});

const updateStatusMastodon = (mastodonURL, mastodonToken, caption, imageID) => new Promise(async (resolve, reject) => {
  if (testMode) {
    console.log('test mode, skipping status update to mastodon instance ' + mastodonURL + ' with token ' + mastodonToken + ' and image ID ' + imageID);
    resolve();
    return;
  };
  console.log('updating status on mastodon instance..');
  const formData = new FormData();
  formData.append('status', caption);
  formData.append('media_ids[]', imageID)
  await axios.post(mastodonURL + '/api/v1/statuses', formData, {
    headers: {
      ...formData.getHeaders(),
      'Authorization': 'Bearer ' + mastodonToken,
    }
  });
  console.log('updated mastodon status successful');
  resolve();
});

const updateStatusInstagram = (instagramIFTTUrl, caption, imageUrl) => new Promise(async (resolve, reject) => {
  if (testMode) {
    console.log('test mode, skipping status update to Instagram via IFTTT ' + instagramIFTTUrl + ' with caption ' + caption + ' and image URL ' + imageUrl);
    resolve();
    return;
  };
  console.log('updating status on Instagram via IFTTT..');
  await axios.post(instagramIFTTUrl, {
    'value1': caption,
    'value2': imageUrl,
    'value3': ''
  }).catch(function (error) {
    if (error.response) {
      console.log('error querying IFTT for Instagram: ' + error.response.data + ' ' + error.response.status);
    }
    reject(error);
    return;
  });
  console.log('updated Instgram status successful');
  resolve();
});

const updateStatusTwitter = (twitterIFTTUrl, caption, imageUrl) => new Promise(async (resolve, reject) => {
  if (testMode) {
    console.log('test mode, skipping status update to Twitter via IFTTT ' + twitterIFTTUrl + ' with caption ' + caption + ' and image URL ' + imageUrl);
    resolve();
    return;
  };
  console.log('updating status on Twitter via IFTTT..');
  await axios.post(twitterIFTTUrl, {
    'value1': caption,
    'value2': imageUrl,
    'value3': ''
  }).catch(function (error) {
    if (error.response) {
      console.log('error querying IFTT for Twitter: ' + error.response.data + ' ' + error.response.status);
    }
    reject(error);
    return;
  });
  console.log('updated Twitter status successful');
  resolve();
});

const uploadImageBluesky = (bskyHandle, bskyPassword, imageUrl) => new Promise(async (resolve, reject) => {
  if (testMode) {
    console.log('test mode, skipping image upload of ' + imageUrl + ' to Bluesky');
    resolve('1234567890');
    return;
  };
  console.log('obtaining Bluesky token..');
  const res = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
    'identifier': bskyHandle,
    'password': bskyPassword
  }).catch(function (error) {
    if (error.response) {
      console.log('error querying Bluesky session endpoint: ' + error.response.data + ' ' + error.response.status);
    }
    reject(error);
    return;
  });
  const sessionToken = res.data.accessJwt;
  axios.get(imageUrl, { responseType: 'arraybuffer' }).then(async function (response) {
    console.log('got image with mime type ' + response.headers['content-type']);
    try {
      const res = await axios.post('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', response.data, {
        headers: {
          'Content-Type': response.headers['content-type'],
          'Authorization': 'Bearer ' + sessionToken,
        }
      });
      console.log('uploaded image to Bluesky successful, id is ' + res.data.blob.ref['$link']);
      resolve({
        'linkID': res.data.blob.ref['$link'],
        'mimeType': res.data.blob['mimeType'],
        'size': res.data.blob['size']
      });
    } catch (error) {
      console.log('failed to upload image to Bluesky..');
      console.log(error);
      reject(error);
    };
  }).catch(function (error) {
    console.log('failed to fetch image from imageURL..');
    console.log(error);
    reject(error);
  });
});

const updateStatusBluesky = (bskyHandle, bskyPassword, caption, imageLinkID, mimeType, size) => new Promise(async (resolve, reject) => {
  if (testMode) {
    console.log('test mode, skipping status update to Bluesky with caption ' + caption + ' and image URL ' + imageUrl);
    resolve();
    return;
  };
  console.log('obtaining Bluesky token..');
  const res = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
    'identifier': bskyHandle,
    'password': bskyPassword
  }).catch(function (error) {
    if (error.response) {
      console.log('error querying Bluesky session endpoint: ' + error.response.data + ' ' + error.response.status);
    }
    reject(error);
    return;
  });
  const sessionToken = res.data.accessJwt;
  const sessionDid = res.data.did;
  console.log('updating status on Bluesky via IFTTT..');
  await axios.post('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    'repo': sessionDid,
    'collection': "app.bsky.feed.post",
    'record': {
      '$type': 'app.bsky.feed.post',
      'text': caption,
      'createdAt': new Date().toISOString(),
      'embed': {
        '$type': 'app.bsky.embed.images',
        'images': [
          {
            'alt': '',
            'image': {
              '$type': 'blob',
              'ref': {
                '$link': imageLinkID
              },
              'mimeType': mimeType,
              'size': size
            }
          }
        ]
      }
    }
  }, {
    headers: {
      'Authorization': 'Bearer ' + sessionToken
    }
  }).catch(function (error) {
    if (error.response) {
      console.log('error querying Bluesky create endpoint: ' + JSON.stringify(error.response.data) + ' ' + error.response.status);
    }
    reject(error);
    return;
  });
  console.log('updated Bluesky status successful');
  resolve();
});


const scheduleStatusUpdate = (context, postingHost, postingToken, caption, imageURL, postingTime) => new Promise(async (resolve, reject) => {
  console.log('scheduling status update..');
  putScheduleDocument(context, postingHost, postingToken, caption, imageURL, postingTime).then(() => {
    console.log('successfully scheduled status update');
    resolve();
  }).catch((err) => {
    console.log('error storing schedule document');
    console.log(err);
    reject(err);
  });
});

const updateScheduler = () => new Promise(async (resolve, reject) => {
  console.log('updating scheduler..');
  let result = { successfulCount: 0, failedCount: 0 };
  let currentTime = Math.floor(Date.now() / 1000);
  try {
    console.log('getting schedule documents from database for Bluesky..');
    await getScheduleDocumentsByTime(CONTEXT_BLUESKY, currentTime).then(async (data) => {
      let items = data.Items;
      for (let i = 0; i < items.length; i++) {
        console.log('running scheduler for Bluesky..');
        try {
          let imageMeta = await uploadImageBluesky(items[i].postingHost, items[i].postingToken, items[i].imageURL);
          console.log('got Bluesky image ID: ' + imageID);
          await updateStatusBluesky(items[i].postingHost, items[i].postingToken, items[i].caption, imageMeta.linkID, imageMeta.mimeType, imageMeta.size);
        } catch (error) {
          console.log('failed to update status on Bluesky instance..');
          console.log(error);
          result.failedCount++;
          continue;
        }
        console.log('updated status on Bluesky instance successful');
        await deleteScheduleDocument(items[i].id);
        result.successfulCount++;
      }
    });
    console.log('getting schedule documents from database for Mastodon..');
    await getScheduleDocumentsByTime(CONTEXT_MASTODON, currentTime).then(async (data) => {
      let items = data.Items;
      for (let i = 0; i < items.length; i++) {
        console.log('running scheduler for Mastodon..');
        try {
          let imageID = await uploadImageMastodon(items[i].postingHost, items[i].postingToken, items[i].imageURL);
          console.log('got mastodon image ID: ' + imageID);
          let caption = shortenCaption(items[i].caption, maxCaptionLength);
          await updateStatusMastodon(items[i].postingHost, items[i].postingToken, items[i].caption, imageID);
        } catch (error) {
          console.log('failed to update status on Mastodon instance..');
          console.log(error);
          result.failedCount++;
          continue;
        }
        console.log('updated status on Mastodon instance successful');
        await deleteScheduleDocument(items[i].id);
        result.successfulCount++;
      }
    });
    console.log('getting schedule documents from database for Twitter..');
    await getScheduleDocumentsByTime(CONTEXT_TWITTER, currentTime).then(async (data) => {
      let items = data.Items;
      for (let i = 0; i < items.length; i++) {
        console.log('running scheduler for Twitter..');
        try {
          await updateStatusTwitter(items[i].postingHost, items[i].caption, items[i].imageURL);
        } catch (error) {
          console.log('failed to update status on Twitter..');
          console.log(error);
          result.failedCount++;
          continue;
        }
        console.log('updated status on Twitter successful');
        await deleteScheduleDocument(items[i].id);
        result.successfulCount++;
      }
    });
    console.log('getting schedule documents from database for Instagram..');
    await getScheduleDocumentsByTime(CONTEXT_INSTAGRAM, currentTime).then(async (data) => {
      let items = data.Items;
      for (let i = 0; i < items.length; i++) {
        console.log('running scheduler for Instagram..');
        try {
          await updateStatusInstagram(items[i].postingHost, items[i].caption, items[i].imageURL);
        } catch (error) {
          console.log('failed to update status on Instagram..');
          console.log(error);
          result.failedCount++;
          continue;
        }
        console.log('updated status on Instagram successful');
        await deleteScheduleDocument(items[i].id);
        result.successfulCount++;
      }
      resolve(result);
    });
  } catch (err) {
    console.log('error getting schedule documents from database');
    console.log(err);
    reject(err);
  }
});

exports.handler = async function (event, context) {
  console.log('running scheduler..');
  console.log(event);
  var body;
  if (event.body)
    body = JSON.parse(event.body);
  else
    body = event;
  const response = {
    statusCode: 200,
    body: ''
  };
  try {
    switch (body.context) {
      case CONTEXT_MASTODON:
      case CONTEXT_TWITTER:
      case CONTEXT_INSTAGRAM:
        console.log('scheduling status update for ' + body.context + '..');
        await scheduleStatusUpdate(body.context, body.postingHost, body.postingToken, body.caption, body.imageURL, body.postingTime);
        console.log('scheduling status update successful');
        return response;
      case CONTEXT_SCHEDULER:
        console.log('running scheduler, checking schedules..');
        let result = await updateScheduler();
        console.log('update of schedules, successfully posted ' + result.successfulCount + ', non-successful ' + result.failedCount);
        return response;
      default:
        console.log('unknown context: ' + body.context);
        response.statusCode = 404;
        response.body = 'unknown context';
        return response;
    }
  } catch (error) {
    console.log('failed to run scheduler..');
    console.log(error);
    response.statusCode = 501;
    response.body = 'failed to run scheduler';
    return response;
  }
}
