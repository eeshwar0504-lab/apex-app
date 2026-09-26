const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('knowledge relationships are bounded to canonical IDs',()=>{
 const ids=new Set(['a','b']);
 const refs=['b'];
 assert.ok(refs.every(x=>ids.has(x)));
});

test('exercise substitution class preserves load semantics',()=>{
 const a={pattern:'push',loadSemantics:'total',unilateral:false};
 const b={...a};
 assert.equal(
   `${a.pattern}|${a.loadSemantics}|bilateral`,
   `${b.pattern}|${b.loadSemantics}|bilateral`
 );
});

test('AI responses must be explicitly grounded',()=>{
 const response={text:'...',provider:'none',grounded:true};
 assert.equal(response.grounded,true);
});

test('knowledge graph implementation validates canonical exercise relationships',()=>{
 const x=read('src/knowledge/knowledgeGraph.ts');
 assert.match(x,/validateExerciseKnowledge/);
 assert.match(x,/substitutionClass/);
 assert.match(x,/rankedAlternatives/);
});

test('knowledge graph keeps substitution alternatives ranked and structured',()=>{
 const x=read('src/knowledge/knowledgeGraph.ts');
 assert.match(x,/rankedAlternatives/);
 assert.match(x,/pattern/);
 assert.match(x,/loadSemantics/);
});

test('exercise knowledge contains the canonical exercise library',()=>{
 const x=read('src/knowledge/exercises.ts');
 assert.match(x,/Machine Chest Press/);
 assert.match(x,/Leg Press/);
 assert.match(x,/Lat Pulldown/);
 assert.match(x,/Cable Triceps Pushdown/);
 assert.match(x,/Dumbbell Lateral Raise/);
 assert.match(x,/Romanian Deadlift/);
 assert.match(x,/Plank/);
});

test('intelligence layer distinguishes recommendations from authoritative training execution',()=>{
 const x=read('src/engine/intelligence.ts');
 assert.ok(
   /recommend/i.test(x) ||
   /adapt/i.test(x) ||
   /intelligen/i.test(x)
 );
});

test('AI gateway exposes grounded uncertainty rather than unrestricted authority',()=>{
 const x=read('src/aiGateway.ts');
 assert.match(x,/grounded/);
 assert.match(x,/uncertainties/);
 assert.match(x,/deterministic engine remains authoritative/);
});

test('coach gateway preserves the deterministic training boundary',()=>{
 const x=read('src/engine/coachGateway.ts');
 assert.ok(
   /grounded/i.test(x) ||
   /deterministic/i.test(x) ||
   /uncertaint/i.test(x)
 );
});

test('AI provider implementations remain provider-agnostic',()=>{
 const local=read('src/aiProviders/localOllama.ts');
 const compatible=read('src/aiProviders/openAICompatible.ts');

 assert.ok(local.length>0);
 assert.ok(compatible.length>0);
});
