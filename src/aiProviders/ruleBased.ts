import type {AIProviderAdapter, ProviderAvailability, ProviderCapabilities} from '../aiGateway';
import type {ProviderInput} from '../aiContract';

/**
 * The deterministic local fallback. This is NOT a language model: it restates the deterministic Coach answer and the
 * known / inferred / unknown split from the supplied context, in the same structured shape a model would return. It needs
 * no network, no account and no key, so APEX can always explain itself offline. Core APEX never requires any provider.
 */
export class RuleBasedProvider implements AIProviderAdapter {
  readonly id = 'rule-based' as const;
  readonly kind = 'rule-based' as const;
  readonly capabilities: ProviderCapabilities = {structuredOutput: true, requiresNetwork: false, worksOffline: true, isLanguageModel: false};

  async availability(): Promise<ProviderAvailability> {
    return {available: true};
  }

  async generate(input: ProviderInput): Promise<string> {
    const {context} = input;
    const parts = [context.deterministicAnswer];
    if (context.unknown.length) parts.push(`Not known yet: ${context.unknown.join(' ')}`);
    const clarification = context.confidence === 'low' && context.unknown.length ? context.unknown[0] : undefined;
    return JSON.stringify({
      response: parts.join(' '),
      groundedClaims: context.known.slice(0, 3).map(fact => ({claim: fact.statement, factIds: [fact.id]})),
      uncertainties: context.unknown,
      ...(clarification ? {requestedClarification: clarification} : {})
    });
  }
}
