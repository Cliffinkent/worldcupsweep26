const knockoutSlots = [
  {
    round: 'Round of 32',
    slots: Array.from({ length: 16 }, (_, index) => ({
      id: `r32-${index + 1}`,
      homePlaceholder: `Round of 32 slot ${index + 1} home`,
      awayPlaceholder: `Round of 32 slot ${index + 1} away`
    }))
  },
  {
    round: 'Round of 16',
    slots: Array.from({ length: 8 }, (_, index) => ({
      id: `r16-${index + 1}`,
      homePlaceholder: `Round of 16 slot ${index + 1} home`,
      awayPlaceholder: `Round of 16 slot ${index + 1} away`
    }))
  },
  {
    round: 'Quarter-finals',
    slots: Array.from({ length: 4 }, (_, index) => ({
      id: `qf-${index + 1}`,
      homePlaceholder: `Quarter-final ${index + 1} home`,
      awayPlaceholder: `Quarter-final ${index + 1} away`
    }))
  },
  {
    round: 'Semi-finals',
    slots: Array.from({ length: 2 }, (_, index) => ({
      id: `sf-${index + 1}`,
      homePlaceholder: `Semi-final ${index + 1} home`,
      awayPlaceholder: `Semi-final ${index + 1} away`
    }))
  },
  {
    round: 'Third-place play-off',
    slots: [
      {
        id: 'third-place',
        homePlaceholder: 'Third-place play-off home',
        awayPlaceholder: 'Third-place play-off away'
      }
    ]
  },
  {
    round: 'Final',
    slots: [
      {
        id: 'final',
        homePlaceholder: 'Final home',
        awayPlaceholder: 'Final away'
      }
    ]
  }
];

module.exports = knockoutSlots;
