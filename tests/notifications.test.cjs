const test = require('node:test');
const assert = require('node:assert/strict');

function intents(state, now = new Date('2026-09-13T10:00:00Z')) {
  const p=state.preferences.notifications; if(!p.enabled)return [];
  const today=now.toISOString().slice(0,10), out=[];
  const planned=state.workouts.filter(w=>w.status==='planned').sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate));
  if(p.workoutReminders){const next=planned.find(w=>w.scheduledDate>=today);if(next)out.push({kind:'workout',id:`workout-${next.id}`});}
  if(p.weeklyReview&&now.getDay()===0)out.push({kind:'weekly',id:`weekly-${today}`});
  return out;
}
const base={preferences:{notifications:{enabled:true,workoutReminders:true,missedWorkout:true,weeklyReview:true}},workouts:[{id:'w1',status:'planned',scheduledDate:'2026-09-14'}]};
test('notification planning chooses the next planned session',()=>assert.equal(intents(base)[0].id,'workout-w1'));
test('disabled notifications produce no intents',()=>assert.deepEqual(intents({...base,preferences:{notifications:{...base.preferences.notifications,enabled:false}}}),[]));
test('weekly review only appears on Sunday',()=>assert.equal(intents(base).filter(x=>x.kind==='weekly').length,1));
