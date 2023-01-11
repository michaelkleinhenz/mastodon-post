require('./index');

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

  