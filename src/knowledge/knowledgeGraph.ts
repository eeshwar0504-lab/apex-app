import type {Exercise, AppState} from '../core/types';
import {comparisonScore, isEquivalentSubstitution, rankSubstitutes} from '../engine/training';
import {exerciseGraph} from '../engine/exerciseGraph';

/** The exercise graph is defined once, in the engine (src/engine/exerciseGraph.ts); the knowledge layer re-exports it. */
export {buildExerciseGraph, exerciseGraph, variationOptions} from '../engine/exerciseGraph';
export type {ExerciseGraph, GraphEdge, GraphIssue, RelationKind, StructuralRelationKind, VariationOptions} from '../engine/exerciseGraph';

export type KnowledgeIssue = { exerciseId:string; field:string; message:string; severity:'warning'|'error' };
export type KnowledgeNode = Exercise & { related:string[]; substitutionClass:string };

export function validateExerciseKnowledge(exercises:Exercise[]):KnowledgeIssue[]{
  const issues:KnowledgeIssue[]=[];
  for(const e of exercises){
    if(!e.id||!e.name) issues.push({exerciseId:e.id||'unknown',field:'identity',message:'Canonical exercise identity is incomplete.',severity:'error'});
    if(e.aliases.some(a=>!a.trim())) issues.push({exerciseId:e.id,field:'aliases',message:'Empty alias should be removed.',severity:'warning'});
    if(!e.pattern) issues.push({exerciseId:e.id,field:'pattern',message:'Movement pattern is missing.',severity:'error'});
    if(!e.primaryMuscles.length) issues.push({exerciseId:e.id,field:'primaryMuscles',message:'Primary muscle mapping is missing.',severity:'error'});
    if(!e.equipment.length) issues.push({exerciseId:e.id,field:'equipment',message:'Equipment mapping is missing.',severity:'error'});
  }
  // relationships: every declared edge is validated by the one graph (unknown ids, self links, repeats, pattern changes, contradictions)
  for(const issue of exerciseGraph(exercises).issues)
    issues.push({exerciseId:issue.exerciseId,field:'relationships',message:issue.message,severity:issue.severity});
  return issues;
}

export function substitutionClass(e:Exercise){return `${e.pattern}|${e.loadSemantics}|${e.unilateral?'unilateral':'bilateral'}`;}

/** Similarity on a 0-100 scale; it is the engine's comparison score, not a second formula. */
export function exerciseSimilarity(a:Exercise,b:Exercise){
  return Math.round(comparisonScore(a,b)*100);
}

/** Ranked replacements. Delegates to the engine's single substitution ranking (rankSubstitutes). */
export function rankedAlternatives(source:Exercise, exercises:Exercise[], equipment:string[]=[]){
  return rankSubstitutes(source,exercises,equipment.length?equipment:undefined).map(item=>({exercise:item.exercise,score:item.score,comparable:isEquivalentSubstitution(source,item.exercise)}));
}

export function knowledgeReport(s:AppState){
  const issues=validateExerciseKnowledge(s.exercises);
  const errors=issues.filter(x=>x.severity==='error').length;
  const warnings=issues.filter(x=>x.severity==='warning').length;
  return {exerciseCount:s.exercises.length,errors,warnings,healthy:errors===0,issues};
}
