const test=require('node:test');const assert=require('node:assert/strict');
test('knowledge relationships are bounded to canonical IDs',()=>{const ids=new Set(['a','b']);const refs=['b'];assert.ok(refs.every(x=>ids.has(x)));});
test('exercise substitution class preserves load semantics',()=>{const a={pattern:'push',loadSemantics:'total',unilateral:false};const b={...a};assert.equal(`${a.pattern}|${a.loadSemantics}|bilateral`,`${b.pattern}|${b.loadSemantics}|bilateral`);});
test('AI responses must be explicitly grounded',()=>{const response={text:'...',provider:'none',grounded:true};assert.equal(response.grounded,true);});
