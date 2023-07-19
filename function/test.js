const { handler } = require('./index');

require('./index');

/*
test('test', () => {
    let text = `
      Am Wochenende mit der Familie ein #escapegame gespielt. Wir haben ein #abenteuerinlondon erlebt. Die Story war haarsträubend dünn, aber die Rätsel waren altersgemäß und abwechslungsreich. Sind wir eigentlich die einzigen, die finden, dass so ein Escape Game nicht mit mehr als 3 Leuten funktioniert? Die Kids fanden es zu langweilig, weil zu langsam. Es kann halt immer nur einer maximal zwei auf die kleinen Karten mit der Aufgabe gucken. Also viel Downtime für die anderen. Trotzdem steht bis 6 Spieler auf der Packung.
      Von und mit @fizzblizz und @mad_jump

      #brettspiele #brettspielsüchtig #brettspielliebe #boardgames #boardgamegeek
      #boardgamegeeks #boardgamecollection #bgg #bggcommunity #spielemachenglücklich #brettspielabend #boardgamesnightandday #boardgamer
      #podcast #brettspielpodcast #brettspielnews
      #share`;
    expect(shortenCaption(text, 500).length).toBeLessThanOrEqual(500);
  });
*/

test('schedule - backlog', async () => {
  setTestMode(true);
  let currentTime = Math.floor(Date.now() / 1000);
  // add mastodon post
  await handler({
    body: JSON.stringify({
      'context': 'mastodon',
      'postingHost': 'https://mastodon.social',
      'postingToken': '1234567890',
      'caption': 'This is a test caption',
      'imageURL': 'http://image.host/image.jpg',
      'postingTime': currentTime - 10,
    })
  }, null);
  // add twitter post
  await handler({
    body: JSON.stringify({
      'context': 'twitter',
      'postingHost': 'https://ifttt.com',
      'postingToken': '',
      'caption': 'This is a test caption',
      'imageURL': 'http://image.host/image.jpg',
      'postingTime': currentTime - 20,
    })
  }, null);
  // run schedule
  await handler({
    body: JSON.stringify({
      'context': 'schedule'
    })
  }, null);
});

test('schedule - preog', async () => {
  setTestMode(true);
  let currentTime = Math.floor(Date.now() / 1000);
  // add mastodon post
  await handler({
    body: JSON.stringify({
      'context': 'mastodon',
      'postingHost': 'https://mastodon.social',
      'postingToken': '1234567890',
      'caption': 'This is a test caption',
      'imageURL': 'http://image.host/image.jpg',
      'postingTime': currentTime + 10,
    })
  }, null);
  // add twitter post
  await handler({
    body: JSON.stringify({
      'context': 'twitter',
      'postingHost': 'https://ifttt.com',
      'postingToken': '',
      'caption': 'This is a test caption',
      'imageURL': 'http://image.host/image.jpg',
      'postingTime': currentTime + 20,
    })
  }, null);
  // wait and run scheduler
  await setTimeout(async () => {
    // run schedule
    await handler({
      body: JSON.stringify({
        'context': 'schedule'
      })
    }, null);
  }, 21000);
});
