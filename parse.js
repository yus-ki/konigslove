const fs = require('fs');
const acorn = require('acorn');
const jsx = require('acorn-jsx');

const Parser = acorn.Parser.extend(jsx());
const code = fs.readFileSync('src/App.tsx', 'utf8');

// I will just use typescript compiler API to parse the AST!
