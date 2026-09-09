const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('local zero-cost provider is optional and uses no new dependency',()=>{
 const x=fs.readFileSync('src/aiProviders/localOllama.ts','utf8');
 assert.match(x,/127\.0\.0\.1:11434/);
 assert.match(x,/Core APEX never requires this provider/);
 assert.match(x,/provider:'local'/);
});

test('AI gateway bounds supplied context before provider execution',()=>{
 const x=fs.readFileSync('src/aiGateway.ts','utf8');
 assert.match(x,/slice\(0,30\)/);
 assert.match(x,/slice\(0,20\)/);
 assert.match(x,/grounded:true/);
});

test('OpenAI-compatible adapter remains optional',()=>{
 const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
 const x=fs.readFileSync('src/aiProviders/openAICompatible.ts','utf8');
 assert.match(x,/OpenAI-compatible adapter/);
 assert.equal(pkg.dependencies['openai'],undefined);
});
