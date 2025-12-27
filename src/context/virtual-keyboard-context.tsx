'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type VirtualKeyboardContextValue = {
    isOpen: boolean;
    activeEditable: HTMLInputElement | HTMLTextAreaElement | null;
    open: () => void;
    close: () => void;
    toggle: () => void;
    typeText: (text: string) => void;
    backspace: () => void;
    enter: () => void;
};

const VirtualKeyboardContext = createContext<VirtualKeyboardContextValue | undefined>(undefined);

function isEditable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
    if (!el) return false;
    // Ignore the "mirror" input rendered by the on-screen keyboard itself.
    if ((el as HTMLElement).dataset?.vkMirror === 'true') return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea';
}

export function VirtualKeyboardProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeEditable, setActiveEditable] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
    const lastEditableRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

    const getTargetEditable = useCallback(() => {
        const elFromRef = lastEditableRef.current;
        if (elFromRef && document.contains(elFromRef)) return elFromRef;
        const active = document.activeElement;
        if (isEditable(active)) return active as HTMLInputElement | HTMLTextAreaElement;
        return null;
    }, []);

    const setNativeValue = useCallback((input: HTMLInputElement | HTMLTextAreaElement, next: string) => {
        const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, next);
        } else {
            input.value = next;
        }

        // Dispatch both 'input' and 'change' events to ensure React picks it up
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, []);

    const refocusLastEditable = useCallback(() => {
        const el = lastEditableRef.current;
        if (el && document.contains(el)) {
            // Focus and move caret to end, but preserve existing value
            const currentValue = el.value;
            el.focus();
            const len = currentValue?.length ?? 0;
            try {
                el.setSelectionRange(len, len);
            } catch (_) {
                // ignore
            }
        }
    }, []);

    const open = useCallback(() => {
        setIsOpen(true);
        // Restore focus after opening (navbar click may steal focus)
        setTimeout(refocusLastEditable, 0);
    }, [refocusLastEditable]);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => {
        setIsOpen((v) => {
            const next = !v;
            if (next) {
                setTimeout(refocusLastEditable, 0);
            }
            return next;
        });
    }, [refocusLastEditable]);

    const typeText = useCallback(
        (text: string) => {
            const input = getTargetEditable();
            if (!input) {
                console.log('insertAtCursor: No editable element focused');
                return;
            }
            if ((input as HTMLInputElement).readOnly || (input as HTMLInputElement).disabled) return;

            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            const before = input.value.slice(0, start);
            const after = input.value.slice(end);
            const next = before + text + after;

            setNativeValue(input, next);

            const newCaret = start + text.length;
            try {
                input.setSelectionRange(newCaret, newCaret);
            } catch (_) {
                // ignore
            }
        },
        [getTargetEditable, setNativeValue]
    );

    const backspace = useCallback(() => {
        const input = getTargetEditable();
        if (!input) return;
        if ((input as HTMLInputElement).readOnly || (input as HTMLInputElement).disabled) return;

        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;

        let newValue = input.value;
        let newCaret = start;

        if (start === end && start > 0) {
            const before = input.value.slice(0, start - 1);
            const after = input.value.slice(end);
            newValue = before + after;
            newCaret = start - 1;
        } else if (start !== end) {
            const before = input.value.slice(0, start);
            const after = input.value.slice(end);
            newValue = before + after;
            newCaret = start;
        }

        setNativeValue(input, newValue);
        try {
            input.setSelectionRange(newCaret, newCaret);
        } catch (_) {
            // ignore
        }
    }, [getTargetEditable, setNativeValue]);

    const enter = useCallback(() => {
        const input = getTargetEditable();
        if (!input) return;

        const tag = (input as Element).tagName.toLowerCase();
        if (tag === 'textarea') {
            typeText('\n');
        } else {
            // For input fields, blur as a simple submit cue
            (input as HTMLElement).blur();
        }
    }, [getTargetEditable, typeText]);

    const value = useMemo<VirtualKeyboardContextValue>(
        () => ({
            isOpen,
            open,
            close,
            toggle,
            activeEditable,
            typeText,
            backspace,
            enter,
        }),
        [activeEditable, backspace, enter, isOpen, open, close, toggle, typeText]
    );

    // Track last focused editable and auto-open when focusing an input/textarea
    React.useEffect(() => {
        const onFocusIn = (e: FocusEvent) => {
            const target = e.target as Element | null;
            if (isEditable(target)) {
                lastEditableRef.current = target as HTMLInputElement | HTMLTextAreaElement;
                setActiveEditable(target as HTMLInputElement | HTMLTextAreaElement);
                // Auto-open when focusing an editable field
                setIsOpen((openNow) => {
                    if (!openNow) {
                        // Defer open to allow focus to settle
                        setTimeout(() => {
                            open();
                        }, 0);
                    }
                    return openNow;
                });
            }
        };
        document.addEventListener('focusin', onFocusIn);
        return () => document.removeEventListener('focusin', onFocusIn);
    }, [open]);

    return <VirtualKeyboardContext.Provider value={value}>{children}</VirtualKeyboardContext.Provider>;
}

export function useVirtualKeyboard() {
    const ctx = useContext(VirtualKeyboardContext);
    if (!ctx) throw new Error('useVirtualKeyboard must be used within VirtualKeyboardProvider');
    return ctx;
}
