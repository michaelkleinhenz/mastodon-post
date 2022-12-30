const FormData = require('form-data');
const axios = require('axios');

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
    await updateStatus(body.mastodonhost, body.token, body.caption, imageID);  
  } catch(error) {
    console.log('failed to run mastodon-post..');
    console.log(error);
    response.statusCode = 501;
    response.body = 'failed to run mastodon-post';
  }
  return response;
}
