// ESM schema file with .mjs extension
export default {
  name: 'MJS Section',
  settings: [
    {
      type: 'text',
      id: 'subtitle',
      label: 'Subtitle',
      default: 'MJS Test Subtitle',
    },
  ],
  blocks: [
    { type: '@app' },
  ],
};
