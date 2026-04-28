import fs from 'fs';

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf-8');

// replace localStorage with Storage EXCEPT in places where we might define it?
// There are no local definitions.
content = content.replace(/\blocalStorage\b/g, 'Storage');

// add import to top
if (!content.includes("import { Storage } from './lib/storage';")) {
    content = content.replace(/^import /m, "import { Storage } from './lib/storage';\nimport ");
}

fs.writeFileSync(file, content);
console.log('Replaced all localStorage with Storage in App.tsx');
