// CommonJS schema file - uses module.exports
module.exports = {
  name: 'CJS Section',
  settings: [
    {
      type: 'text',
      id: 'title',
      label: 'Title',
      default: 'CJS Test Title',
    },
  ],
  blocks: [
    { type: '@app' },
  ],
};
