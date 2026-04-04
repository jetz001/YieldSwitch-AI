function cleanJson(str) {
  if (!str) return "{}";
  
  // Preliminary cleanup
  let s = String(str)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  
  // Extract main object
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  
  // Ensure keys are quoted
  s = s.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*(?=("|{|\[|-?\d|t|f|null))/g, '$1"$2": ');
  s = s.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

  // THE KEY PART: Fix nested quotes in values
  // We match : "VALUE" and ensure that VALUE doesn't incorrectly terminate.
  // We use a regex that looks for : " ... " followed by punctuation.
  // We use backreference-like logic or a robust lookahead.
  
  // Let's identify each value block and escape it
  // We find : " until we see ", " OR "} OR "]
  s = s.replace(/:\s*"([\s\S]*?)"(?=\s*[,}\]])/g, (match, content) => {
    // If 'content' contains quotes, escape them
    return `: "${content.replace(/"/g, "'")}"`;
  });

  // Final cleanup
  s = s.replace(/,\s*([}\]])/g, '$1');
  s = s.replace(/\s*([{}\[\]])\s*/g, '$1');

  return s;
}

const test1 = '{"strategy": "HOLD", "confidence": 80, "reasoning": "Current position is long on BCH/USDT, "wi": "is holding"}';
const test2 = '{"strategy": "HOLD", "confidence": 80, "reasoning": "Technical analysis shows "bullish" divergence.", "trades": []}';
const test3 = '{"strategy": "DIRECTIONAL", "reasoning": "RSI is 70+, suggesting "overbought".", "confidence": 90}';

console.log("Test 1 Result:", cleanJson(test1));
console.log("Test 2 Result:", cleanJson(test2));
console.log("Test 3 Result:", cleanJson(test3));

function testParse(name, result) {
    try {
        JSON.parse(result);
        console.log(`${name} Parse: SUCCESS`);
    } catch(e) {
        console.log(`${name} Parse: FAILED - ${e.message}`);
    }
}

testParse("Test 1", cleanJson(test1));
testParse("Test 2", cleanJson(test2));
testParse("Test 3", cleanJson(test3));
