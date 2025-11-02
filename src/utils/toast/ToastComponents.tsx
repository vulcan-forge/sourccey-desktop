import { FaTimes } from 'react-icons/fa';

export const ToastCloseButton = ({ closeToast }: { closeToast: () => void }) => {
    return (
        <button
            className="absolute top-1/2 right-3 flex -translate-y-1/2 cursor-pointer items-center justify-center border-none bg-transparent p-1 text-white hover:text-slate-200"
            onClick={closeToast}
        >
            <FaTimes />
        </button>
    );
};
