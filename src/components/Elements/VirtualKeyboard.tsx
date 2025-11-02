'use client';

import React from 'react';
import { useVirtualKeyboard } from '@/context/virtual-keyboard-context';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';

type Layer = 'letters' | 'symbols1' | 'symbols2';

export const VirtualKeyboard: React.FC = () => {
    const { isKioskMode } = useAppMode();
    const { isOpen, close, typeText, backspace, enter } = useVirtualKeyboard();
    const [shift, setShift] = React.useState(false);
    const [layer, setLayer] = React.useState<Layer>('letters');

    const onKey = (label: string) => {
        if (label === '⌫') return backspace();
        if (label === 'Enter') {
            enter();
            return;
        }
        if (label === 'Space') return typeText(' ');
        if (label === '⇧') return setShift((s) => !s);
        if (label === '123') {
            console.log('Switching to numbers layer, current active element:', document.activeElement);
            console.log('Current value before switch:', (document.activeElement as HTMLInputElement)?.value);
            setLayer('symbols1');
            setShift(false);
            // Ensure focus stays on the input field
            setTimeout(() => {
                const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
                console.log('After layer switch, active element:', active);
                console.log('Value after switch:', active?.value);
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                    active.focus();
                    console.log('Refocused element, value:', active.value);
                }
            }, 0);
            return;
        }
        if (label === 'ABC') {
            setLayer('letters');
            setShift(false);
            // Ensure focus stays on the input field
            setTimeout(() => {
                const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                    active.focus();
                }
            }, 0);
            return;
        }
        if (label === '+=#') {
            setLayer('symbols2');
            setShift(false);
            // Ensure focus stays on the input field
            setTimeout(() => {
                const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                    active.focus();
                }
            }, 0);
            return;
        }
        typeText(shift ? label.toUpperCase() : label);
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
        <div className="pointer-events-none fixed inset-0 z-[3000]">
            {/* Keyboard panel - only this captures events */}
            <div
                className="pointer-events-auto fixed right-0 bottom-0 left-0 mx-auto mb-0 w-full max-w-3xl rounded-t-xl p-3 shadow-2xl"
                onMouseDown={(e) => e.preventDefault()}
                style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.05)', // slate-800 @ 5% - almost invisible
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
                <div className="flex flex-col gap-1">
                    {rows.map((row, idx) => (
                        <div key={idx} className="flex justify-center gap-0">
                            {row.map((key) => {
                                const isWideKey = key.length > 1;
                                const isSpace = key === 'Space';
                                const display = (() => {
                                    if (layer === 'letters' && key.length === 1 && /[a-z]/.test(key)) {
                                        return shift ? key.toUpperCase() : key;
                                    }
                                    return key;
                                })();
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => onKey(key)}
                                        className={`rounded-none px-4 py-4 text-base font-semibold text-white ${
                                            isSpace ? 'flex-[4]' : isWideKey ? 'min-w-[90px]' : 'min-w-[60px]'
                                        }`}
                                        style={{
                                            backgroundColor: 'rgba(51, 65, 85, 0.1)', // slate-700 @ 10% - almost invisible
                                            border: '1px solid rgba(71, 85, 105, 0.15)',
                                            backdropFilter: 'none',
                                            WebkitBackdropFilter: 'none',
                                        }}
                                    >
                                        {display}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
