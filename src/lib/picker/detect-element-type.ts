import type { FieldElementType } from '../schema/script';

const NATIVE_INPUT_TYPES: readonly FieldElementType[] = [
  'text', 'number', 'email', 'tel', 'password', 'url', 'date',
  'datetime-local', 'month', 'week', 'time', 'checkbox', 'radio', 'range', 'color',
];

export function detectElementType(element: Element): FieldElementType {
  const tag = element.tagName.toLowerCase();

  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';

  if (tag === 'input') {
    const type = (element as HTMLInputElement).type as FieldElementType;
    return NATIVE_INPUT_TYPES.includes(type) ? type : 'text';
  }

  return 'custom';
}
