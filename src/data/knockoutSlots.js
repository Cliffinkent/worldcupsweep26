const roundOf32Slots = require('./roundOf32Slots');

function slot(matchNumber, homePlaceholder, awayPlaceholder) {
  return {
    id: `m${matchNumber}`,
    matchNumber,
    homePlaceholder,
    awayPlaceholder
  };
}

const knockoutSlots = [
  {
    round: 'Round of 32',
    slots: roundOf32Slots.map((match) => slot(match.matchNumber, match.slotA.label, match.slotB.label))
  },
  {
    round: 'Round of 16',
    slots: [
      slot(89, 'Winner Match 73', 'Winner Match 75'),
      slot(90, 'Winner Match 74', 'Winner Match 77'),
      slot(91, 'Winner Match 76', 'Winner Match 78'),
      slot(92, 'Winner Match 79', 'Winner Match 80'),
      slot(93, 'Winner Match 83', 'Winner Match 84'),
      slot(94, 'Winner Match 81', 'Winner Match 82'),
      slot(95, 'Winner Match 86', 'Winner Match 88'),
      slot(96, 'Winner Match 85', 'Winner Match 87')
    ]
  },
  {
    round: 'Quarter-finals',
    slots: [
      slot(97, 'Winner Match 89', 'Winner Match 90'),
      slot(98, 'Winner Match 93', 'Winner Match 94'),
      slot(99, 'Winner Match 91', 'Winner Match 92'),
      slot(100, 'Winner Match 95', 'Winner Match 96')
    ]
  },
  {
    round: 'Semi-finals',
    slots: [
      slot(101, 'Winner Match 97', 'Winner Match 98'),
      slot(102, 'Winner Match 99', 'Winner Match 100')
    ]
  },
  {
    round: 'Third-place play-off',
    slots: [
      slot(103, 'Loser Match 101', 'Loser Match 102')
    ]
  },
  {
    round: 'Final',
    slots: [
      slot(104, 'Winner Match 101', 'Winner Match 102')
    ]
  }
];

module.exports = knockoutSlots;
