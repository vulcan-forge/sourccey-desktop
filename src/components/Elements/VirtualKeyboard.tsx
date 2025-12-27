'use client';

import React from 'react';
import { useVirtualKeyboard } from '@/context/virtual-keyboard-context';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

type Layer = 'letters' | 'symbols1' | 'symbols2';

export const VirtualKeyboard: React.FC = () => {
    const { isKioskMode } = useAppMode();
    const { isOpen, close, activeEditable } = useVirtualKeyboard();
    const [shift, setShift] = React.useState(false);
    const [layer, setLayer] = React.useState<Layer>('letters');

    const mirrorRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
    const [mirrorValue, setMirrorValue] = React.useState('');
    const [mirrorSelection, setMirrorSelection] = React.useState<{ start: number; end: number } | null>(null);
    const [isMirrorRevealed, setIsMirrorRevealed] = React.useState(false);
    const isPushingToTargetRef = React.useRef(false);

    const setNativeValue = React.useCallback((input: HTMLInputElement | HTMLTextAreaElement, next: string) => {
        const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, next);
        } else {
            input.value = next;
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, []);

    const pushToTarget = React.useCallback(
        (nextValue: string, selStart: number, selEnd: number) => {
            if (!activeEditable) return;
            if ((activeEditable as HTMLInputElement).readOnly || (activeEditable as HTMLInputElement).disabled) return;

            isPushingToTargetRef.current = true;
            try {
                setNativeValue(activeEditable, nextValue);
                try {
                    activeEditable.setSelectionRange(selStart, selEnd);
                } catch (_) {
                    // ignore
                }
            } finally {
                // Let any target 'input' listeners run first, then re-enable syncing.
                setTimeout(() => {
                    isPushingToTargetRef.current = false;
                }, 0);
            }
        },
        [activeEditable, setNativeValue]
    );

    // Initialize mirror value when the keyboard opens or when the target changes.
    React.useEffect(() => {
        if (!isOpen) return;
        if (!activeEditable) return;
        const v = activeEditable.value ?? '';
        setMirrorValue(v);
        const len = v.length;
        setMirrorSelection({ start: len, end: len });
    }, [activeEditable, isOpen]);

    // Reset reveal state when switching fields / reopening.
    React.useEffect(() => {
        if (!isOpen) return;
        setIsMirrorRevealed(false);
    }, [activeEditable, isOpen]);

    // Keep the mirror focused while the keyboard is open so the caret is visible,
    // but continue writing into the real field via the VK context (which ignores the mirror).
    React.useEffect(() => {
        if (!isOpen) return;
        if (!activeEditable) return;
        setTimeout(() => {
            const mirror = mirrorRef.current;
            if (!mirror) return;
            try {
                mirror.focus({ preventScroll: true } as FocusOptions);
            } catch (_) {
                try {
                    mirror.focus();
                } catch (_) {
                    // ignore
                }
            }
        }, 0);
    }, [activeEditable, isOpen]);

    // Keep mirror updated if the underlying input changes via app logic (NOT from the mirror).
    React.useEffect(() => {
        if (!isOpen) return;
        if (!activeEditable) return;
        const el = activeEditable;

        const handler = () => {
            if (isPushingToTargetRef.current) return;
            const v = el.value ?? '';
            setMirrorValue((prev) => (prev === v ? prev : v));
            // NOTE: we intentionally do NOT sync selection from the real input; the mirror is the source of truth.
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
        return () => {
            el.removeEventListener('input', handler);
            el.removeEventListener('change', handler);
        };
    }, [activeEditable, isOpen]);

    // Apply selection to the mirror field when we know it (lets caret track on-screen typing).
    React.useLayoutEffect(() => {
        if (!mirrorSelection) return;
        const el = mirrorRef.current;
        if (!el) return;
        try {
            el.setSelectionRange(mirrorSelection.start, mirrorSelection.end);
        } catch (_) {
            // ignore (e.g. some input types)
        }
    }, [mirrorSelection, mirrorValue]);

    const refocusMirror = React.useCallback(() => {
        const mirror = mirrorRef.current;
        if (!mirror) return;
        try {
            mirror.focus({ preventScroll: true } as FocusOptions);
        } catch (_) {
            try {
                mirror.focus();
            } catch (_) {
                // ignore
            }
        }
    }, []);

    const handleMirrorChange = React.useCallback(
        (next: string, start: number, end: number) => {
            setMirrorValue(next);
            setMirrorSelection({ start, end });
            pushToTarget(next, start, end);
            refocusMirror();
        },
        [pushToTarget, refocusMirror]
    );

    const handleMirrorSelect = React.useCallback(() => {
        const mirror = mirrorRef.current;
        if (!mirror) return;
        const start = mirror.selectionStart ?? 0;
        const end = mirror.selectionEnd ?? start;
        setMirrorSelection({ start, end });
        pushToTarget(mirror.value ?? '', start, end);
        refocusMirror();
    }, [pushToTarget, refocusMirror]);

    const insertTextInMirror = React.useCallback(
        (text: string) => {
            const current = mirrorValue;
            const start = mirrorSelection?.start ?? current.length;
            const end = mirrorSelection?.end ?? current.length;
            const next = current.slice(0, start) + text + current.slice(end);
            const caret = start + text.length;
            setMirrorValue(next);
            setMirrorSelection({ start: caret, end: caret });
            pushToTarget(next, caret, caret);
            refocusMirror();
        },
        [mirrorSelection?.end, mirrorSelection?.start, mirrorValue, pushToTarget, refocusMirror]
    );

    const backspaceInMirror = React.useCallback(() => {
        const current = mirrorValue;
        const start = mirrorSelection?.start ?? current.length;
        const end = mirrorSelection?.end ?? current.length;

        let next = current;
        let caret = start;

        if (start !== end) {
            next = current.slice(0, start) + current.slice(end);
            caret = start;
        } else if (start > 0) {
            next = current.slice(0, start - 1) + current.slice(end);
            caret = start - 1;
        } else {
            return;
        }

        setMirrorValue(next);
        setMirrorSelection({ start: caret, end: caret });
        pushToTarget(next, caret, caret);
        refocusMirror();
    }, [mirrorSelection?.end, mirrorSelection?.start, mirrorValue, pushToTarget, refocusMirror]);

    const enterInMirror = React.useCallback(() => {
        if (!activeEditable) return;
        const tag = activeEditable.tagName.toLowerCase();
        if (tag === 'textarea') {
            insertTextInMirror('\n');
            return;
        }
        // Input: treat Enter as "done"
        try {
            activeEditable.blur();
        } catch (_) {
            // ignore
        }
        close();
    }, [activeEditable, close, insertTextInMirror]);

    const onKey = (label: string) => {
        if (label === '⌫') return backspaceInMirror();
        if (label === 'Enter') return enterInMirror();
        if (label === 'Space') return insertTextInMirror(' ');
        if (label === '⇧') return setShift((s) => !s);
        if (label === '123') {
            setLayer('symbols1');
            setShift(false);
            return;
        }
        if (label === 'ABC') {
            setLayer('letters');
            setShift(false);
            return;
        }
        if (label === '+=#') {
            setLayer('symbols2');
            setShift(false);
            return;
        }
        insertTextInMirror(shift ? label.toUpperCase() : label);
        // Auto-turn off shift after typing a letter (like mobile keyboards)
        if (shift && layer === 'letters' && /[a-z]/.test(label)) {
            setShift(false);
        }
    };

    const rows: string[][] = React.useMemo(() => {
        if (layer === 'letters') {
            return [
                // Row 1: full QWERTY + Backspace (right)
                ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '⌫'],
                // Row 2: Shift (left) + home row + Enter (right)
                ['⇧', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'Enter'],
                // Row 3: Numbers toggle (left) + bottom row + punctuation + Space (centered by flex grow)
                ['123', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', 'Space'],
            ];
        }
        if (layer === 'symbols1') {
            return [
                // Row 1: digits + Backspace
                ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫'],
                // Row 2: - (left) + common symbols + Enter (right)
                ['-', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 'Enter'],
                // Row 3: ABC (left) + more symbols + toggle to symbols2 (right) + Space
                ['ABC', '_', '=', '+', '[', ']', '{', '}', '\\', '|', '+=#', 'Space'],
            ];
        }
        // symbols2
        return [
            // Row 1: extended symbols + Backspace
            ['~', '<', '>', '€', '£', '¥', '•', '·', '±', '§', '⌫'],
            // Row 2: ¶ (left) + punctuation set + Enter (right)
            ['¶', ';', ':', "'", '"', '/', '?', '`', '©', '®', '™', 'Enter'],
            // Row 3: ABC now on the left, 123 near Space
            ['ABC', '°', '¹', '²', '³', '¼', '½', '¾', '÷', '×', '123', 'Space'],
        ];
    }, [layer]);

    if (!isKioskMode) return null;
    if (!isOpen) return null;

    return (
        <div className="pointer-events-none fixed inset-0 z-3000">
            {/* Keyboard panel - only this captures events */}
            <div
                className="pointer-events-auto fixed right-0 bottom-0 left-0 mx-auto mb-0 w-full max-w-3xl rounded-t-xl p-3 shadow-2xl"
                // Prevent accidental text-selection / focus changes when clicking the panel background,
                // but allow interacting with inputs/buttons inside the keyboard.
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) e.preventDefault();
                }}
                style={{
                    backgroundColor: 'rgb(30, 41, 59)', // slate-800 - solid fill
                    border: '1px solid rgba(71, 85, 105, 0.1)',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                }}
            >
                {/* Close button - absolutely positioned so it doesn't affect layout */}
                <button
                    type="button"
                    aria-label="Close keyboard"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        close();
                    }}
                    className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-600/60 bg-slate-700/60 text-white hover:bg-slate-700/80"
                    style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
                >
                    ×
                </button>

                {/* Mirror field: shows/edits the currently-focused input even if it's covered */}
                {activeEditable && (
                    <div className="mb-2">
                        {activeEditable.tagName.toLowerCase() === 'textarea' ? (
                            <textarea
                                ref={(el) => {
                                    mirrorRef.current = el;
                                }}
                                data-vk-mirror="true"
                                value={mirrorValue}
                                onChange={(e) =>
                                    handleMirrorChange(
                                        e.target.value,
                                        e.currentTarget.selectionStart ?? e.target.value.length,
                                        e.currentTarget.selectionEnd ?? e.target.value.length
                                    )
                                }
                                onSelect={handleMirrorSelect}
                                onClick={handleMirrorSelect}
                                onMouseUp={handleMirrorSelect}
                                onKeyUp={handleMirrorSelect}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !(e.currentTarget instanceof HTMLTextAreaElement)) return;
                                }}
                                className="w-full resize-none rounded-lg border-2 border-slate-500/60 bg-slate-900 px-3 py-2 font-mono text-base text-white outline-none focus:border-slate-400"
                                rows={2}
                                placeholder="Type…"
                            />
                        ) : (
                            <div className="flex w-full overflow-hidden rounded-lg border-2 border-slate-500/60 bg-slate-900 focus-within:border-slate-400">
                                <input
                                    ref={(el) => {
                                        mirrorRef.current = el;
                                    }}
                                    data-vk-mirror="true"
                                    value={mirrorValue}
                                    onChange={(e) =>
                                        handleMirrorChange(
                                            e.target.value,
                                            e.currentTarget.selectionStart ?? e.target.value.length,
                                            e.currentTarget.selectionEnd ?? e.target.value.length
                                        )
                                    }
                                    onSelect={handleMirrorSelect}
                                    onClick={handleMirrorSelect}
                                    onMouseUp={handleMirrorSelect}
                                    onKeyUp={handleMirrorSelect}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            enterInMirror();
                                        }
                                    }}
                                    className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-base text-white outline-none"
                                    placeholder="Type…"
                                    type={(() => {
                                        if (!(activeEditable instanceof HTMLInputElement)) return 'text';
                                        const t = activeEditable.type || 'text';
                                        if (t === 'password') return isMirrorRevealed ? 'text' : 'password';
                                        return t;
                                    })()}
                                />

                                {activeEditable instanceof HTMLInputElement && (activeEditable.type || 'text') === 'password' && (
                                    <button
                                        type="button"
                                        aria-label={isMirrorRevealed ? 'Hide password' : 'Show password'}
                                        onMouseDown={(e) => {
                                            // Don’t steal focus from the mirror input.
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={() => {
                                            setIsMirrorRevealed((v) => !v);
                                            // Keep caret visible after toggling.
                                            refocusMirror();
                                        }}
                                        className="flex h-full w-12 items-center justify-center border-l border-slate-500/60 bg-slate-800/70 text-slate-200 hover:bg-slate-800"
                                    >
                                        {isMirrorRevealed ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    {rows.map((row, idx) => {
                        const isFirstRow = idx === 0;
                        const isLastRow = idx === rows.length - 1;
                        return (
                            <div key={idx} className="flex w-full gap-0">
                                {row.map((key, keyIdx) => {
                                    const isWideKey = key.length > 1;
                                    const isSpace = key === 'Space';
                                    const isEnter = key === 'Enter';
                                    const isBackspace = key === '⌫';
                                    const isShift = key === '⇧';
                                    const isFirstKey = keyIdx === 0;
                                    const isLastKey = keyIdx === row.length - 1;
                                    const display = (() => {
                                        if (layer === 'letters' && key.length === 1 && /[a-z]/.test(key)) {
                                            return shift ? key.toUpperCase() : key;
                                        }
                                        return key;
                                    })();
                                    
                                    // Calculate flex value for consistent row widths
                                    let flexValue = 'flex-1'; // Default for regular keys
                                    if (isSpace) {
                                        flexValue = 'flex-[4]'; // Space bar takes more space
                                    } else if (isEnter || isBackspace || isShift) {
                                        flexValue = 'flex-[1.5]'; // Modifier keys slightly wider
                                    } else if (isWideKey) {
                                        flexValue = 'flex-[1.2]'; // Other wide keys (like "123", "ABC")
                                    }
                                    
                                    // Calculate rounded corners for outer buttons
                                    let roundedClasses = 'rounded-none';
                                    if (isFirstRow) {
                                        if (isFirstKey) roundedClasses = 'rounded-tl-lg';
                                        else if (isLastKey) roundedClasses = 'rounded-tr-lg';
                                    } else if (isLastRow) {
                                        if (isFirstKey) roundedClasses = 'rounded-bl-lg';
                                        else if (isLastKey) roundedClasses = 'rounded-br-lg';
                                    }
                                    
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => onKey(key)}
                                            className={`${flexValue} ${roundedClasses} px-2 py-4 text-base font-semibold text-white`}
                                            style={{
                                                backgroundColor: 'rgb(51, 65, 85)', // slate-700 - solid fill
                                                border: '2px solid rgba(71, 85, 105, 0.5)',
                                                backdropFilter: 'none',
                                                WebkitBackdropFilter: 'none',
                                            }}
                                        >
                                            {display}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
