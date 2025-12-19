/**
 * BMAD Diagram Converter
 * Export all modules for programmatic use
 */

const { parseMermaid, validateMermaid, SHAPE_MAPPINGS } = require('./mermaid-parser');
const { toDrawio, convertToDrawio, convertSequenceToDrawio } = require('./drawio-converter');
const { toMarkdown, validationReportToMarkdown } = require('./markdown-converter');

module.exports = {
  // Parser
  parseMermaid,
  validateMermaid,
  SHAPE_MAPPINGS,

  // Converters
  toDrawio,
  toMarkdown,

  // Individual converters
  convertToDrawio,
  convertSequenceToDrawio,

  // Utilities
  validationReportToMarkdown,
};
