import { useQuery, useQueryClient } from '@tanstack/react-query';

const MODAL_QUERY_KEYS = {
    modalState: (modalId: string) => ['modal', 'state', modalId] as const,
};

interface ModalContextHook {
    useGetModal: (modalId: string) => any;
    openModal: (modalId: string, data: any) => void;
    closeModal: (modalId: string) => void;
    getModalData: (modalId: string) => any;
    setModalData: (modalId: string, data: any) => void;
}

export const useModalContext = (): ModalContextHook => {
    const queryClient = useQueryClient();

    const useGetModal = (modalId: string) =>
        useQuery({
            queryKey: MODAL_QUERY_KEYS.modalState(modalId),
            queryFn: () => getModalData(modalId),
            initialData: null,
        });

    const openModal = (modalId: string, data: any) => {
        setModalData(modalId, data);
    };

    const closeModal = (modalId: string) => {
        setModalData(modalId, null);
    };

    const getModalData = (modalId: string) => {
        const modalState = queryClient.getQueryData(MODAL_QUERY_KEYS.modalState(modalId));
        return modalState;
    };

    const setModalData = (modalId: string, data: any) => {
        queryClient.setQueryData(MODAL_QUERY_KEYS.modalState(modalId), data);
    };

    return { useGetModal, openModal, closeModal, getModalData, setModalData };
};
