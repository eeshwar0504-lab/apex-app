export type AIProvider = 'none'|'local'|'openai-compatible'|'custom';

export interface CoachRequest {
  prompt:string;
  context?:{facts:string[];recommendations:string[];uncertainties:string[]};
}
export interface CoachResponse { text:string; provider:AIProvider; grounded:boolean; disclaimer?:string; }

export interface AIProviderAdapter {
  readonly id:AIProvider;
  complete(request:CoachRequest):Promise<CoachResponse>;
}

/** Core-safe gateway. The deterministic engine remains authoritative; AI can only explain or summarize supplied context. */
export class ApexAIGateway {
  private adapter?:AIProviderAdapter;
  constructor(adapter?:AIProviderAdapter){this.adapter=adapter;}

  async explain(request:CoachRequest):Promise<CoachResponse>{
    const safe={
      prompt:request.prompt.trim().slice(0,4000),
      context:{
        facts:(request.context?.facts||[]).filter(Boolean).slice(0,30).map(x=>String(x).slice(0,500)),
        recommendations:(request.context?.recommendations||[]).filter(Boolean).slice(0,20).map(x=>String(x).slice(0,500)),
        uncertainties:(request.context?.uncertainties||[]).filter(Boolean).slice(0,20).map(x=>String(x).slice(0,500))
      }
    };
    if(!this.adapter) return {
      text:'APEX has no AI provider connected. The deterministic training engine remains available and can explain the evidence stored locally.',
      provider:'none',grounded:true
    };
    try{
      const response=await this.adapter.complete(safe);
      return {...response,grounded:true,disclaimer:response.disclaimer||'AI output is explanatory only. The deterministic APEX training engine remains authoritative.'};
    }catch{
      return {text:'The optional AI provider failed. APEX remains fully usable without it.',provider:this.adapter.id,grounded:true,disclaimer:'Provider failure did not affect training state.'};
    }
  }
}
