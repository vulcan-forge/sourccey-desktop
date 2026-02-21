import React, { useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';

interface GeneralModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    showCloseButton?: boolean;
    borderClassName?: string;
}

export const GeneralModal: React.FC<GeneralModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'md',
    showCloseButton = true,
    borderClassName,
}) => {
    // Handle escape key press
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    // Handle backdrop click
    const handleBackdropClick = (event: React.MouseEvent) => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
    };

    return (
        <div className="fixed inset-0 z-90 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={handleBackdropClick} />

            <div
                className={`relative w-full ${sizeClasses[size]} mx-4 transform rounded-xl ${
                    borderClassName ?? 'border border-slate-700/50'
                } bg-slate-800/90 p-6 shadow-2xl backdrop-blur-sm transition-all duration-300`}
            >
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                    {showCloseButton && (
                        <button
                            onClick={onClose}
                            className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-slate-700/50 hover:text-white"
                        >
                            <FaTimes className="h-5 w-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="space-y-4">{children}</div>
            </div>
        </div>
    );
};
