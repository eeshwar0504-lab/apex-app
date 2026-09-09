import type {Exercise, AppState} from '../core/types';

export type KnowledgeIssue = { exerciseId:string; field:string; message:string; severity:'warning'|'error' };
export type KnowledgeNode = Exercise & { related:string[]; substitutionClass:string };

export function validateExerciseKnowledge(exercises:Exercise[]):KnowledgeIssue[]{
  const issues:KnowledgeIssue[]=[];
  const ids=new Set(exercises.map(e=>e.id));
  for(const e of exercises){
    if(!e.id||!e.name) issues.push({exerciseId:e.id||'unknown',field:'identity',message:'Canonical exercise identity is incomplete.',severity:'error'});
    if(e.aliases.some(a=>!a.trim())) issues.push({exerciseId:e.id,field:'aliases',message:'Empty alias should be removed.',severity:'warning'});
    if(!e.pattern) issues.push({exerciseId:e.id,field:'pattern',message:'Movement pattern is missing.',severity:'error'});
    if(!e.primaryMuscles.length) issues.push({exerciseId:e.id,field:'primaryMuscles',message:'Primary muscle mapping is missing.',severity:'error'});
    if(!e.equipment.length) issues.push({exerciseId:e.id,field:'equipment',message:'Equipment mapping is missing.',severity:'error'});
    for(const id of [...(e.alternatives||[]),...(e.progressions||[]),...(e.regressions||[])])
      if(!ids.has(id)) issues.push({exerciseId:e.id,field:'relationships',message:`Relationship points to unknown exercise: ${id}`,severity:'warning'});
  }
  return issues;
}

export function substitutionClass(e:Exercise){return `${e.pattern}|${e.loadSemantics}|${e.unilateral?'unilateral':'bilateral'}`;}

export function exerciseSimilarity(a:Exercise,b:Exercise){
  let score=0;
  if(a.pattern===b.pattern) score+=4;
  if(a.loadSemantics===b.loadSemantics) score+=3;
  if(a.unilateral===b.unilateral) score+=1;
  score+=a.primaryMuscles.filter(m=>b.primaryMuscles.includes(m)).length*2;
  score+=a.secondaryMuscles.filter(m=>b.secondaryMuscles.includes(m)).length;
  score+=a.equipment.filter(x=>b.equipment.includes(x)).length;
  return score;
}

export function rankedAlternatives(source:Exercise, exercises:Exercise[], equipment:string[]=[]){
  return exercises.filter(e=>e.id!==source.id).map(e=>{
    const available=e.equipment.includes('bodyweight')||e.equipment.some(x=>equipment.includes(x));
    const sameClass=substitutionClass(source)===substitutionClass(e);
    return {exercise:e,score:exerciseSimilarity(source,e)+(available?3:0)+(sameClass?5:0),comparable:sameClass};
  }).sort((a,b)=>b.score-a.score);
}

export function knowledgeReport(s:AppState){
  const issues=validateExerciseKnowledge(s.exercises);
  const errors=issues.filter(x=>x.severity==='error').length;
  const warnings=issues.filter(x=>x.severity==='warning').length;
  return {exerciseCount:s.exercises.length,errors,warnings,healthy:errors===0,issues};
}
