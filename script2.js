import fs from 'fs';

const file = 'src/components/VoiceCloneTTS.tsx';
let content = fs.readFileSync(file, 'utf-8');

content = content.replace(/\blocalStorage\b/g, 'Storage');

if (!content.includes("import { Storage } from '../lib/storage';")) {
    content = content.replace(/^import /m, "import { Storage } from '../lib/storage';\nimport ");
}

fs.writeFileSync(file, content);
console.log('Replaced all localStorage with Storage in VoiceCloneTTS.tsx');
