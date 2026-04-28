const fs = require('fs');

const code = fs.readFileSync('src/App.tsx', 'utf8');
const lines = code.split('\n');

function checkBalance(openChar, closeChar) {
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Simple check, ignores strings and comments which can cause false positives,
    // but in JSX it's usually indicative. Let's filter out // comments.
    const cleanLine = line.split('//')[0];
    for (let j = 0; j < cleanLine.length; j++) {
      const char = cleanLine[j];
      if (char === openChar) stack.push({ char, line: i + 1, col: j });
      if (char === closeChar) {
          if (stack.length && stack[stack.length - 1].char === openChar) {
              stack.pop();
          } else {
              console.log('Unmatched', closeChar, 'at line', i + 1);
          }
      }
    }
  }
  console.log('Remaining', openChar, 'in stack:');
  stack.forEach(item => console.log(item.char, 'at line', item.line));
  return stack.length;
}

checkBalance('(', ')');
checkBalance('{', '}');
