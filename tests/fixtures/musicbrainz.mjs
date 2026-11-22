// Minimal MusicBrainz recording search fixtures, with multiple editions of one recording.
export const recording = {
  id: '11111111-0001-4000-8000-000000000001', title: 'Крошка моя', length: 250000,
  'artist-credit': [{ name: 'Руки вверх!', artist: { name: 'Руки вверх!' } }], 'first-release-date': '1998',
  isrcs: ['RUA1B9800001'],
  releases: [{ title: 'Сборник', date: '2013-01-01', status: 'Official' }, { title: 'Сделай погромче!', date: '1998', status: 'Official' }],
};
export const alternateRecording = {
  ...recording, id: '11111111-0001-4000-8000-000000000002', length: 290600, disambiguation: 'remix',
  isrcs: ['RUA1B1300001'], releases: [{ title: 'Ремиксы', status: 'Official' }],
};
