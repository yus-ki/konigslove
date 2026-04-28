const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const mainEndStr = '      </main>\n';
const mainEnd = content.lastIndexOf(mainEndStr) + mainEndStr.length;

const beforeMain = content.substring(0, mainEnd);

const callStartStr = '          <AnimatePresence>\n            {showCallScreen && (';
const callStart = content.indexOf(callStartStr, mainEnd);
const callEndStr = '          </AnimatePresence>';
const callEnd = content.indexOf(callEndStr, callStart) + callEndStr.length;
const callScreenBlock = content.substring(callStart, callEnd);

const transferStartStr = '          <TransferModal';
const transferStart = content.indexOf(transferStartStr, callEnd);
const transferEndStr = '          />';
const transferEnd = content.indexOf(transferEndStr, transferStart) + transferEndStr.length;
const transferBlock = content.substring(transferStart, transferEnd);

const chatStartStr = '      <ChatFooter';
const chatStart = content.indexOf(chatStartStr, transferEnd);
const chatEndStr = '          />';
const chatEnd = content.indexOf(chatEndStr, chatStart) + chatEndStr.length;
const chatBlock = content.substring(chatStart, chatEnd);

const finalString = beforeMain + '\n' +
  callScreenBlock + '\n\n' +
  transferBlock + '\n\n' +
  chatBlock + '\n    </div>\n  );\n}\n\nexport default App;\n';

fs.writeFileSync('src/App.tsx', finalString);
console.log('App.tsx repaired.');
