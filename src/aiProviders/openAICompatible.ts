import type {AIProviderAdapter, CoachRequest, CoachResponse} from '../aiGateway';

export interface OpenAICompatibleOptions {
  endpoint:string;
  apiKey?:string;
  model:string;
  timeoutMs?:number;
}

/**
 * Optional OpenAI-compatible adapter. It is intentionally not required by
 * APEX and should only be supplied by an integrator/user who controls the
 * endpoint. No API key is persisted by the core repository.
 */
export class OpenAICompatibleProvider implements AIProviderAdapter {
  readonly id='openai-compatible' as const;
  constructor(private readonly options:OpenAICompatibleOptions){}

  async complete(request:CoachRequest):Promise<CoachResponse>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.options.timeoutMs??20000);
    try{
      const c=request.context||{facts:[],recommendations:[],uncertainties:[]};
      const system='APEX training engine is authoritative. Use only supplied context; never invent facts. If insufficient, state uncertainty. Context:\n'+
        `Facts: ${c.facts.join(' | ')}\nRecommendations: ${c.recommendations.join(' | ')}\nUncertainties: ${c.uncertainties.join(' | ')}`;
      const headers:Record<string,string>={'content-type':'application/json'};
      if(this.options.apiKey) headers.authorization=`Bearer ${this.options.apiKey}`;
      const response=await fetch(this.options.endpoint,{method:'POST',headers,body:JSON.stringify({
        model:this.options.model,messages:[{role:'system',content:system},{role:'user',content:request.prompt}],temperature:0.1
      }),signal:controller.signal});
      if(!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);
      const data:any=await response.json();
      const text=typeof data?.choices?.[0]?.message?.content==='string'?data.choices[0].message.content.trim():'';
      if(!text) throw new Error('AI provider returned an empty response.');
      return {text,provider:'openai-compatible',grounded:true,disclaimer:'Generated from supplied APEX context. Verify important training decisions against APEX recommendations.'};
    }catch(error){
      return {text:'The optional AI provider could not be reached. APEX remains fully usable without it.',provider:'openai-compatible',grounded:true,disclaimer:error instanceof Error?error.message:'AI provider unavailable.'};
    }finally{clearTimeout(timer);}
  }
}
