import type {Exercise} from './core/types';
import type {GroundedAIContext, ProviderFailureCode, ProviderInput, VettedAIOutput} from './aiContract';
import {ProviderError, parseAIOutput, vetAIOutput} from './aiContract';
import {renderPrompt} from './aiGrounding';
import {LocalOllamaProvider} from './aiProviders/localOllama';
import {OpenAICompatibleProvider} from './aiProviders/openAICompatible';
import {RuleBasedProvider} from './aiProviders/ruleBased';

/*
 * The AI gateway: the one place that chooses a provider, calls it, and decides what comes back. Providers live in
 * aiProviders/ and hide everything vendor specific. The Coach builds the grounded context; the deterministic engine stays
 * outside this module entirely. The deterministic engine remains authoritative: the gateway returns TEXT for the screen and
 * nothing else, never throws, and falls back to the deterministic Coach answer on any failure.
 */
export type AIProvider = 'none' | 'local' | 'openai-compatible' | 'custom' | 'rule-based';
export type AIMode = 'off' | 'rule-based' | 'local-model' | 'cloud';
export type ProviderKind = 'rule-based' | 'local-model' | 'cloud';

export const AI_MODES: readonly AIMode[] = ['off', 'rule-based', 'local-model', 'cloud'];

export interface ProviderCapabilities {
  structuredOutput: boolean;
  requiresNetwork: boolean;
  worksOffline: boolean;
  /** false for the deterministic rule-based fallback: it is not a language model. */
  isLanguageModel: boolean;
}

export interface ProviderAvailability {
  available: boolean;
  reason?: ProviderFailureCode;
}

export interface CoachRequest {
  prompt:string;
  context?:{facts:string[];recommendations:string[];uncertainties:string[]};
}
export interface CoachResponse { text:string; provider:AIProvider; grounded:boolean; disclaimer?:string; }

/** The provider-neutral interface. Adapters throw ProviderError on failure; the gateway classifies it. */
export interface AIProviderAdapter {
  readonly id: AIProvider;
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;
  availability(): Promise<ProviderAvailability>;
  /** Returns the provider's raw text. Never trusted: the gateway parses and vets it. */
  generate(input: ProviderInput): Promise<string>;
  /** Legacy free-text entry point, kept for compatibility. */
  complete?(request: CoachRequest): Promise<CoachResponse>;
}

export interface AIConfig {
  mode: AIMode;
  timeoutMs?: number;
  local?: {endpoint?: string; model?: string};
  /** Cloud use is explicit: it needs consent and an https endpoint. The key lives in memory only and is never persisted. */
  cloud?: {endpoint: string; model: string; apiKey?: string; consent: boolean};
}

export type FallbackReason =
  | 'ai_off'
  | 'not_configured'
  | 'consent_required'
  | 'insecure_endpoint'
  | 'provider_unavailable'
  | 'network'
  | 'timeout'
  | 'unsupported'
  | 'malformed_output'
  | 'rejected_output'
  | 'provider_error';

export type SelectionResult = {adapter: AIProviderAdapter; reason?: undefined} | {adapter?: undefined; reason: FallbackReason};

const isSecureEndpoint = (endpoint: string): boolean => {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'));
  } catch { return false; }
};

/** Provider selection. Pure and deterministic: the same config always selects the same kind of provider (or none). */
export function selectProvider(config: AIConfig | undefined): SelectionResult {
  const mode = config && AI_MODES.includes(config.mode) ? config.mode : 'off';
  if (mode === 'off') return {reason: 'ai_off'};
  if (mode === 'rule-based') return {adapter: new RuleBasedProvider()};
  if (mode === 'local-model') return {adapter: new LocalOllamaProvider({...(config?.local || {}), timeoutMs: config?.timeoutMs})};
  const cloud = config?.cloud;
  if (!cloud || !cloud.endpoint || !cloud.model) return {reason: 'not_configured'};
  if (cloud.consent !== true) return {reason: 'consent_required'};
  if (!isSecureEndpoint(cloud.endpoint)) return {reason: 'insecure_endpoint'};
  return {adapter: new OpenAICompatibleProvider({endpoint: cloud.endpoint, apiKey: cloud.apiKey, model: cloud.model, timeoutMs: config?.timeoutMs})};
}

export interface AIOutcome {
  /** Where the text came from: the deterministic Coach itself, the rule-based fallback, or a language model. */
  source: 'deterministic' | 'rule-based' | 'ai';
  provider: AIProvider;
  text: string;
  /** The deterministic Coach answer, always carried so the screen can show it next to anything else. */
  deterministicText: string;
  fallbackReason?: FallbackReason;
  /** Only for language-model output: what was kept and what was removed, and why. */
  vetted?: VettedAIOutput;
  requestedClarification?: string;
  disclaimer: string;
}

export const DETERMINISTIC_NOTE = 'The deterministic APEX training engine remains authoritative. This text explains; it never changes your plan.';

const FAILURE_TO_FALLBACK: Record<ProviderFailureCode, FallbackReason> = {
  unavailable: 'provider_unavailable',
  network: 'network',
  timeout: 'timeout',
  unsupported: 'unsupported',
  not_configured: 'not_configured',
  http_error: 'provider_error',
  empty_response: 'malformed_output'
};

const withTimeout = <T,>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProviderError('timeout', 'provider did not answer in time')), ms);
    work.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });

export interface ExplainOptions {
  exercises: readonly Exercise[];
  equipment?: readonly string[];
}

/** Core-safe gateway. The deterministic engine remains authoritative; AI can only explain or summarize supplied context. */
export class ApexAIGateway {
  private adapter?:AIProviderAdapter;
  private selectionReason?: FallbackReason;
  private readonly timeoutMs: number;

  constructor(adapterOrConfig?: AIProviderAdapter | AIConfig, timeoutMs = 20000) {
    const adapter = adapterOrConfig && 'generate' in adapterOrConfig ? adapterOrConfig : undefined;
    const config = adapterOrConfig && !('generate' in adapterOrConfig) ? adapterOrConfig : undefined;
    if (adapter) {
      this.adapter = adapter;
    } else if (config) {
      const selected = selectProvider(config);
      this.adapter = selected.adapter;
      this.selectionReason = selected.reason;
    } else {
      this.selectionReason = 'ai_off';
    }
    this.timeoutMs = config?.timeoutMs ? config.timeoutMs : timeoutMs;
  }

  get providerId(): AIProvider { return this.adapter?.id ?? 'none'; }
  get providerKind(): ProviderKind | undefined { return this.adapter?.kind; }

  async availability(): Promise<ProviderAvailability> {
    if (!this.adapter) return {available: false, reason: 'unavailable'};
    try { return await withTimeout(this.adapter.availability(), Math.min(this.timeoutMs, 3000)); }
    catch (error) { return {available: false, reason: error instanceof ProviderError ? error.code : 'unavailable'}; }
  }

  /**
   * Explains one grounded Coach answer. Never throws and never returns anything but text: any failure, malformed output
   * or fully rejected output yields the deterministic Coach answer instead.
   */
  async explainGrounded(context: GroundedAIContext, options: ExplainOptions): Promise<AIOutcome> {
    const deterministic = (reason: FallbackReason): AIOutcome => ({
      source: 'deterministic',
      provider: this.providerId,
      text: context.deterministicAnswer,
      deterministicText: context.deterministicAnswer,
      fallbackReason: reason,
      disclaimer: DETERMINISTIC_NOTE
    });
    const adapter = this.adapter;
    if (!adapter) return deterministic(this.selectionReason ?? 'ai_off');
    try {
      const availability = await this.availability();
      if (!availability.available) return deterministic(availability.reason ? FAILURE_TO_FALLBACK[availability.reason] : 'provider_unavailable');
      const prompt = renderPrompt(context);
      const raw = await withTimeout(adapter.generate({system: prompt.system, user: prompt.user, context, expectJson: true, timeoutMs: this.timeoutMs}), this.timeoutMs);
      const parsed = parseAIOutput(raw);
      if (!parsed.ok) return deterministic('malformed_output');
      if (adapter.kind === 'rule-based') {
        // the rule-based fallback restates the deterministic answer itself, so there is nothing to vet it against
        return {source: 'rule-based', provider: adapter.id, text: parsed.output.response, deterministicText: context.deterministicAnswer, requestedClarification: parsed.output.requestedClarification, disclaimer: `Rule-based summary (no AI model). ${DETERMINISTIC_NOTE}`};
      }
      const vetted = vetAIOutput(parsed.output, context, {exercises: options.exercises, equipment: options.equipment});
      if (!vetted.text) return {...deterministic('rejected_output'), vetted};
      return {source: 'ai', provider: adapter.id, text: vetted.text, deterministicText: context.deterministicAnswer, vetted, requestedClarification: vetted.requestedClarification, disclaimer: `AI-generated explanation. ${DETERMINISTIC_NOTE}`};
    } catch (error) {
      return deterministic(error instanceof ProviderError ? FAILURE_TO_FALLBACK[error.code] : 'provider_error');
    }
  }

  /** Legacy free-text path, kept for compatibility. Context is bounded before any provider sees it. */
  async explain(request:CoachRequest):Promise<CoachResponse>{
    const safe={
      prompt:request.prompt.trim().slice(0,4000),
      context:{
        facts:(request.context?.facts||[]).filter(Boolean).slice(0,30).map(x=>String(x).slice(0,500)),
        recommendations:(request.context?.recommendations||[]).filter(Boolean).slice(0,20).map(x=>String(x).slice(0,500)),
        uncertainties:(request.context?.uncertainties||[]).filter(Boolean).slice(0,20).map(x=>String(x).slice(0,500))
      }
    };
    if(!this.adapter || !this.adapter.complete) return {
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
