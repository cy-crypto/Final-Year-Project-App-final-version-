import { useRef } from 'react';

/**
 * Enter moves to the next field; Enter on the last field runs `onDone` (usually submit).
 *
 *   const field = useFieldChain(3, handleSave);
 *   <TextInput {...field(0)} />  <TextInput {...field(1)} />  <TextInput {...field(2)} />
 */
type Focusable = { focus: () => void };

export function useFieldChain(count: number, onDone?: () => void) {
  const refs = useRef<(Focusable | null)[]>([]);

  return (index: number) => {
    const isLast = index >= count - 1;
    return {
      ref: (node: Focusable | null) => {
        refs.current[index] = node;
      },
      returnKeyType: isLast ? ('done' as const) : ('next' as const),
      // Keep the keyboard open while moving between fields.
      submitBehavior: isLast ? ('blurAndSubmit' as const) : ('submit' as const),
      onSubmitEditing: () => {
        if (isLast) onDone?.();
        else refs.current[index + 1]?.focus();
      },
    };
  };
}
