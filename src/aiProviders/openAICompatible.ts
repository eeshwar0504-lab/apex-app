import type {AIProviderAdapter, CoachRequest, CoachResponse, ProviderAvailability, ProviderCapabilities} from '../aiGateway';
import type {ProviderInput} from '../aiContract';
import {ProviderError} from '../aiContract';

export interface OpenAICompatibleOptions {
  endpoint:string;
  apiKey?:string;
  model:string;
  timeoutMs?:number;
}

/**
 * Optional OpenAI-compatible adapter. It is intentionally not required by
 * APEX and should only be supplied by an integrator/user who controls the
 * endpoint. No API key is persisted by the core repository, and the gateway only builds this adapter after explicit
 * consent and for an https (or loopback) endpoint. A key held by a browser app is visible to whoever uses that browser,
 * so production use should point at an endpoint the user controls rather than embed a shared key.
 */
export class OpenAICompatibleProvider implements AIProviderAdapter {
  readonly id='openai-compatible' as const;
  readonly kind='cloud' as const;
  readonly capabilities: ProviderCapabilities = {structuredOutput: true, requiresNetwork: true, worksOffline: false, isLanguageModel: true};
  constructor(private readonly options:OpenAICompatibleOptions){}

  async availability(): Promise<ProviderAvailability> {
    // no network probe: a probe would itself send a request to a third party. Availability here means "configured".
    return this.options.endpoint&&this.options.model?{available:true}:{available:false,reason:'not_configured'};
  }

  async generate(input:ProviderInput):Promise<string>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.options.timeoutMs??input.timeoutMs??20000);
    try{
      const headers:Record<string,string>={'content-type':'application/json'};
      if(this.options.apiKey) headers.authorization=`Bearer ${this.options.apiKey}`;
      let response:Response;
      try{
        response=await fetch(this.options.endpoint,{method:'POST',headers,body:JSON.stringify({
          model:this.options.model,messages:[{role:'system',content:input.system},{role:'user',content:input.user}],temperature:0.1,...(input.expectJson?{response_format:{type:'json_object'}}:{})
        }),signal:controller.signal});
      }catch(error){
        throw new ProviderError(controller.signal.aborted?'timeout':'network');
      }
      if(!response.ok) throw new ProviderError('http_error',`AI provider returned HTTP ${response.status}.`);
      const data:any=await response.json().catch(()=>undefined);
      const text=typeof data?.choices?.[0]?.message?.content==='string'?data.choices[0].message.content.trim():'';
      if(!text) throw new ProviderError('empty_response','AI provider returned an empty response.');
      return text;
    }finally{clearTimeout(timer);}
  }

  /** Legacy free-text entry point; failures are reported as text and never thrown. */
  async complete(request:CoachRequest):Promise<CoachResponse>{
    try{
      const c=request.context||{facts:[],recommendations:[],uncertainties:[]};
      const system='APEX training engine is authoritative. Use only supplied context; never invent facts. If insufficient, state uncertainty. Context:\n'+
        `Facts: ${c.facts.join(' | ')}\nRecommendations: ${c.recommendations.join(' | ')}\nUncertainties: ${c.uncertainties.join(' | ')}`;
      const text=await this.generate({system,user:request.prompt,context:undefined as never,expectJson:false,timeoutMs:this.options.timeoutMs??20000});
      return {text,provider:'openai-compatible',grounded:true,disclaimer:'Generated from supplied APEX context. Verify important training decisions against APEX recommendations.'};
    }catch(error){
      return {text:'The optional AI provider could not be reached. APEX remains fully usable without it.',provider:'openai-compatible',grounded:true,disclaimer:error instanceof Error?error.message:'AI provider unavailable.'};
    }
  }
}
