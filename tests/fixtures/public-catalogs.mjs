const cid = 'QmerX2iozUJH2SXLw3s4WYr82wSSeTaf6DiNm6bk2jnfiR';
export const creatorStream = `https://creatornode.audius.co/tracks/cidstream/${cid}?signature=fixture`;
export const storageStream = `https://validator.eeba4a6ca56a0d87af802270217c2a51.r2.cloudflarestorage.com/nfi/${cid}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${'a'.repeat(64)}`;
export const audiusRecording = {
  id: 'DX0Xb', title: 'Siberian Jazz', user: { name: 'EIME', handle: 'EIME' }, genre: 'Jazz', duration: 115,
  permalink: '/EIME/siberian-jazz', license: 'All rights reserved', is_available: true, is_streamable: true,
  is_stream_gated: false, stream_conditions: null, is_unlisted: false, access: { stream: true, download: false },
  stream: { url: 'https://not-trusted.example/stream' },
};
