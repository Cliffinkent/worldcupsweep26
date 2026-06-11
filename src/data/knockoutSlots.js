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
    slots: [
      slot(73, 'Runner-up Group A', 'Runner-up Group B'),
      slot(74, 'Winner Group E', '3rd Group A/B/C/D/F'),
      slot(75, 'Winner Group F', 'Runner-up Group C'),
      slot(76, 'Winner Group C', 'Runner-up Group F'),
      slot(77, 'Winner Group I', '3rd Group C/D/F/G/H'),
      slot(78, 'Runner-up Group E', 'Runner-up Group I'),
      slot(79, 'Winner Group A', '3rd Group C/E/F/H/I'),
      slot(80, 'Winner Group L', '3rd Group E/H/I/J/K'),
      slot(81, 'Winner Group D', '3rd Group B/E/F/I/J'),
      slot(82, 'Winner Group G', '3rd Group A/E/H/I/J'),
      slot(83, 'Runner-up Group K', 'Runner-up Group L'),
      slot(84, 'Winner Group H', 'Runner-up Group J'),
      slot(85, 'Winner Group B', '3rd Group E/F/G/I/J'),
      slot(86, 'Winner Group J', 'Runner-up Group H'),
      slot(87, 'Winner Group K', '3rd Group D/E/I/J/L'),
      slot(88, 'Runner-up Group D', 'Runner-up Group G')
    ]
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
