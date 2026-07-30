import type { SelectorCandidate } from './script';

export const SELECTOR_STRATEGIES: SelectorCandidate['strategy'][] = ['id', 'name', 'data-testid', 'aria-label', 'css', 'xpath'];

export const SELECTOR_STRATEGY_OPTIONS: { value: string; label: string }[] = SELECTOR_STRATEGIES.map((strategy) => ({
  value: strategy,
  label: strategy,
}));
