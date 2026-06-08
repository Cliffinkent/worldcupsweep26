const sweepstakeTeams = [
  {
    id: 'czechia',
    group: 'A',
    owner: 'Amy',
    country: 'Czechia',
    flag: '🇨🇿',
    fifaName: 'Czechia',
    aliases: ['Czechia', 'Czech Republic']
  },
  {
    id: 'south-korea',
    group: 'A',
    owner: 'Barry',
    country: 'South Korea',
    flag: '🇰🇷',
    fifaName: 'Korea Republic',
    aliases: ['South Korea', 'Korea Republic', 'Republic of Korea']
  },
  {
    id: 'south-africa',
    group: 'A',
    owner: 'Dawn',
    country: 'South Africa',
    flag: '🇿🇦',
    fifaName: 'South Africa',
    aliases: ['South Africa']
  },
  {
    id: 'mexico',
    group: 'A',
    owner: 'Marion',
    country: 'Mexico',
    flag: '🇲🇽',
    fifaName: 'Mexico',
    aliases: ['Mexico']
  },
  {
    id: 'canada',
    group: 'B',
    owner: 'Adam',
    country: 'Canada',
    flag: '🇨🇦',
    fifaName: 'Canada',
    aliases: ['Canada']
  },
  {
    id: 'bosnia-and-herzegovina',
    group: 'B',
    owner: 'Chris',
    country: 'Bosnia and Herzegovina',
    flag: '🇧🇦',
    fifaName: 'Bosnia and Herzegovina',
    aliases: ['Bosnia and Herzegovina', 'Bosnia & Herzegovina', 'Bosnia-Herzegovina', 'Bosnia']
  },
  {
    id: 'qatar',
    group: 'B',
    owner: 'Jason O',
    country: 'Qatar',
    flag: '🇶🇦',
    fifaName: 'Qatar',
    aliases: ['Qatar']
  },
  {
    id: 'switzerland',
    group: 'B',
    owner: 'Barry',
    country: 'Switzerland',
    flag: '🇨🇭',
    fifaName: 'Switzerland',
    aliases: ['Switzerland']
  },
  {
    id: 'brazil',
    group: 'C',
    owner: 'Ann',
    country: 'Brazil',
    flag: '🇧🇷',
    fifaName: 'Brazil',
    aliases: ['Brazil']
  },
  {
    id: 'morocco',
    group: 'C',
    owner: 'Laura',
    country: 'Morocco',
    flag: '🇲🇦',
    fifaName: 'Morocco',
    aliases: ['Morocco']
  },
  {
    id: 'haiti',
    group: 'C',
    owner: 'Dawn',
    country: 'Haiti',
    flag: '🇭🇹',
    fifaName: 'Haiti',
    aliases: ['Haiti']
  },
  {
    id: 'scotland',
    group: 'C',
    owner: 'Tina',
    country: 'Scotland',
    flag: '🏴',
    fifaName: 'Scotland',
    aliases: ['Scotland']
  },
  {
    id: 'united-states',
    group: 'D',
    owner: 'Tina',
    country: 'United States',
    flag: '🇺🇸',
    fifaName: 'United States',
    aliases: ['United States', 'USA', 'USMNT', 'United States of America']
  },
  {
    id: 'paraguay',
    group: 'D',
    owner: 'Carolyn',
    country: 'Paraguay',
    flag: '🇵🇾',
    fifaName: 'Paraguay',
    aliases: ['Paraguay']
  },
  {
    id: 'australia',
    group: 'D',
    owner: 'Blaine',
    country: 'Australia',
    flag: '🇦🇺',
    fifaName: 'Australia',
    aliases: ['Australia']
  },
  {
    id: 'turkiye',
    group: 'D',
    owner: 'Blaine',
    country: 'Türkiye',
    flag: '🇹🇷',
    fifaName: 'Türkiye',
    aliases: ['Türkiye', 'Turkey', 'Turkiye']
  },
  {
    id: 'germany',
    group: 'E',
    owner: 'Jason O',
    country: 'Germany',
    flag: '🇩🇪',
    fifaName: 'Germany',
    aliases: ['Germany']
  },
  {
    id: 'curacao',
    group: 'E',
    owner: 'Ann',
    country: 'Curaçao',
    flag: '🇨🇼',
    fifaName: 'Curaçao',
    aliases: ['Curaçao', 'Curacao']
  },
  {
    id: 'cote-divoire',
    group: 'E',
    owner: 'Jason P',
    country: 'Côte d’Ivoire',
    flag: '🇨🇮',
    fifaName: 'Côte d’Ivoire',
    aliases: ['Côte d’Ivoire', "Cote d'Ivoire", 'Ivory Coast', 'Cote d Ivoire']
  },
  {
    id: 'ecuador',
    group: 'E',
    owner: 'Laura',
    country: 'Ecuador',
    flag: '🇪🇨',
    fifaName: 'Ecuador',
    aliases: ['Ecuador']
  },
  {
    id: 'netherlands',
    group: 'F',
    owner: 'Marion',
    country: 'Netherlands',
    flag: '🇳🇱',
    fifaName: 'Netherlands',
    aliases: ['Netherlands', 'Holland']
  },
  {
    id: 'japan',
    group: 'F',
    owner: 'Carolyn',
    country: 'Japan',
    flag: '🇯🇵',
    fifaName: 'Japan',
    aliases: ['Japan']
  },
  {
    id: 'sweden',
    group: 'F',
    owner: 'Kelly',
    country: 'Sweden',
    flag: '🇸🇪',
    fifaName: 'Sweden',
    aliases: ['Sweden']
  },
  {
    id: 'tunisia',
    group: 'F',
    owner: 'Christina',
    country: 'Tunisia',
    flag: '🇹🇳',
    fifaName: 'Tunisia',
    aliases: ['Tunisia']
  },
  {
    id: 'belgium',
    group: 'G',
    owner: 'Tod',
    country: 'Belgium',
    flag: '🇧🇪',
    fifaName: 'Belgium',
    aliases: ['Belgium']
  },
  {
    id: 'egypt',
    group: 'G',
    owner: 'Sophie',
    country: 'Egypt',
    flag: '🇪🇬',
    fifaName: 'Egypt',
    aliases: ['Egypt']
  },
  {
    id: 'iran',
    group: 'G',
    owner: 'Sophie',
    country: 'Iran',
    flag: '🇮🇷',
    fifaName: 'Iran',
    aliases: ['Iran', 'IR Iran']
  },
  {
    id: 'new-zealand',
    group: 'G',
    owner: 'Cliff',
    country: 'New Zealand',
    flag: '🇳🇿',
    fifaName: 'New Zealand',
    aliases: ['New Zealand']
  },
  {
    id: 'spain',
    group: 'H',
    owner: 'Rachael',
    country: 'Spain',
    flag: '🇪🇸',
    fifaName: 'Spain',
    aliases: ['Spain']
  },
  {
    id: 'cape-verde',
    group: 'H',
    owner: 'Amy',
    country: 'Cape Verde',
    flag: '🇨🇻',
    fifaName: 'Cape Verde',
    aliases: ['Cape Verde', 'Cape Verde Islands', 'Cabo Verde']
  },
  {
    id: 'saudi-arabia',
    group: 'H',
    owner: 'Ian',
    country: 'Saudi Arabia',
    flag: '🇸🇦',
    fifaName: 'Saudi Arabia',
    aliases: ['Saudi Arabia']
  },
  {
    id: 'uruguay',
    group: 'H',
    owner: 'Marc',
    country: 'Uruguay',
    flag: '🇺🇾',
    fifaName: 'Uruguay',
    aliases: ['Uruguay']
  },
  {
    id: 'france',
    group: 'I',
    owner: 'Christina',
    country: 'France',
    flag: '🇫🇷',
    fifaName: 'France',
    aliases: ['France']
  },
  {
    id: 'senegal',
    group: 'I',
    owner: 'Marc',
    country: 'Senegal',
    flag: '🇸🇳',
    fifaName: 'Senegal',
    aliases: ['Senegal']
  },
  {
    id: 'iraq',
    group: 'I',
    owner: 'Andre',
    country: 'Iraq',
    flag: '🇮🇶',
    fifaName: 'Iraq',
    aliases: ['Iraq']
  },
  {
    id: 'norway',
    group: 'I',
    owner: 'Rachael',
    country: 'Norway',
    flag: '🇳🇴',
    fifaName: 'Norway',
    aliases: ['Norway']
  },
  {
    id: 'argentina',
    group: 'J',
    owner: 'Chris',
    country: 'Argentina',
    flag: '🇦🇷',
    fifaName: 'Argentina',
    aliases: ['Argentina']
  },
  {
    id: 'algeria',
    group: 'J',
    owner: 'Tod',
    country: 'Algeria',
    flag: '🇩🇿',
    fifaName: 'Algeria',
    aliases: ['Algeria']
  },
  {
    id: 'austria',
    group: 'J',
    owner: 'Jason P',
    country: 'Austria',
    flag: '🇦🇹',
    fifaName: 'Austria',
    aliases: ['Austria']
  },
  {
    id: 'jordan',
    group: 'J',
    owner: 'Cliff',
    country: 'Jordan',
    flag: '🇯🇴',
    fifaName: 'Jordan',
    aliases: ['Jordan']
  },
  {
    id: 'portugal',
    group: 'K',
    owner: 'Andre',
    country: 'Portugal',
    flag: '🇵🇹',
    fifaName: 'Portugal',
    aliases: ['Portugal']
  },
  {
    id: 'dr-congo',
    group: 'K',
    owner: 'Robin',
    country: 'DR Congo',
    flag: '🇨🇩',
    fifaName: 'Congo DR',
    aliases: ['DR Congo', 'Congo DR', 'Democratic Republic of the Congo']
  },
  {
    id: 'uzbekistan',
    group: 'K',
    owner: 'Robin',
    country: 'Uzbekistan',
    flag: '🇺🇿',
    fifaName: 'Uzbekistan',
    aliases: ['Uzbekistan']
  },
  {
    id: 'colombia',
    group: 'K',
    owner: 'Adam',
    country: 'Colombia',
    flag: '🇨🇴',
    fifaName: 'Colombia',
    aliases: ['Colombia']
  },
  {
    id: 'england',
    group: 'L',
    owner: 'Kelly',
    country: 'England',
    flag: '🏴',
    fifaName: 'England',
    aliases: ['England']
  },
  {
    id: 'croatia',
    group: 'L',
    owner: 'Ian',
    country: 'Croatia',
    flag: '🇭🇷',
    fifaName: 'Croatia',
    aliases: ['Croatia']
  },
  {
    id: 'ghana',
    group: 'L',
    owner: 'Ayrton',
    country: 'Ghana',
    flag: '🇬🇭',
    fifaName: 'Ghana',
    aliases: ['Ghana']
  },
  {
    id: 'panama',
    group: 'L',
    owner: 'Ayrton',
    country: 'Panama',
    flag: '🇵🇦',
    fifaName: 'Panama',
    aliases: ['Panama']
  }
];

module.exports = sweepstakeTeams;
