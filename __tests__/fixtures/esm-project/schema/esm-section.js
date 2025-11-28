// ESM schema file - uses export default
export default {
  name: 'ESM Section',
  settings: [
    {
      type: 'text',
      id: 'heading',
      label: 'Heading',
      default: 'ESM Test Heading',
    },
  ],
  blocks: [
    { type: '@app' },
  ],
};
