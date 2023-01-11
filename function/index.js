/*
 * This function is used to post an image to a mastodon instance.
 * Copyright (c) 2022 Michael Kleinhenz <michael@kleinhenz.net>.
 * Licensed under the MIT License.
 */

const FormData = require('form-data');
const axios = require('axios');

const maxCaptionLength = 500;
const hashTagOccurenceLimit = 2;
const filters = [
  { from: '@fizzblizz', to: '@Fizzblizz' },
];

findHashtagStart = (text) => {
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

extractCaptionBody = (text) => {
  if (!text) return '';
  let hashtagStart = findHashtagStart(text);
  return text.substring(0, hashtagStart).trim()
}

extractHashTags = (text) => {
  if (!text) return [];
  let hashtagStart = findHashtagStart(text);
  let hashtagText = text.substring(hashtagStart, text.length).trim()
  return hashtagText.match(/#[^\s#\.\;]*/gmi);
};

extractMentions = (text) => {
  if (!text) return [];
  return text.match(/@[^\s@]*/gmi);
};

removeTextElements = (text, elements) => {
  if (!text) return text;
  elements.forEach(element => {
    text = text.replace(element, '');
  });
  return text.replace(/\s+/g,' ');
}

const filterCaption = (text) => {
  if (!text) return text;
  filters.forEach(filter => {
    text = text.replace(filter.from, filter.to);
  });
  return text;
}

shortenCaption = (text, maxLength) => {
  if (!text) return text;
  if (text.length <= maxLength) return text;
  // first parse caption
  let captionBody = filterCaption(extractCaptionBody(text));
  // if the body is already too long, force shorten it
  if (captionBody.length > maxLength) {
    let shortenedText = captionBody.substring(0, maxLength-1);
    let lastDot = shortenedText.lastIndexOf('.');
    if (lastDot > 0) {
      let final = shortenedText.substring(0, lastDot) + '.';
      console.log('shortened caption by removing text after last dot, final length: ' + final.length);
      return final;
    } 
    let final = shortenedText.substring(0, maxLength-3) + '...';
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

const uploadImage = (mastodonURL, mastodonToken, imageUrl) => new Promise((resolve, reject) => {
  axios.get(imageUrl, { responseType: 'arraybuffer' }).then(async function (response) {
    console.log('got image with mime type ' + response.headers['content-type']);
    const formData = new FormData();
    formData.append('file', response.data, {filename: 'image', contentType: response.headers['content-type']});
    try {
      const res = await axios.post(mastodonURL + '/api/v2/media', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': 'Bearer ' + mastodonToken,
        }
      });
      console.log('uploaded image to mastodon instance successful, id is ' + res.data.id);
      resolve(res.data.id);      
    } catch(error) {
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

const updateStatus = (mastodonURL, mastodonToken, caption, imageID) => new Promise(async (resolve, reject) => {
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

exports.handler = async function (event, context) {
  let body = JSON.parse(event.body);
  const response = {
    statusCode: 200,
    body: ''
  };
  try {
    let imageID = await uploadImage(body.mastodonhost, body.token, body.imgurl);
    console.log('got image ID: ' + imageID);
    let caption = shortenCaption(body.caption, maxCaptionLength);
    await updateStatus(body.mastodonhost, body.token, caption, imageID);  
  } catch(error) {
    console.log('failed to run mastodon-post..');
    console.log(error);
    response.statusCode = 501;
    response.body = 'failed to run mastodon-post';
  }
  return response;
}
