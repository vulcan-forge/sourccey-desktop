export const DATA_CAPTURE_ENABLED_STORAGE_KEY = 'vulcan.data-capture.enabled';

export const getDataCaptureEnabled = (storage: Pick<Storage, 'getItem'> = window.localStorage): boolean => {
    return storage.getItem(DATA_CAPTURE_ENABLED_STORAGE_KEY) !== 'false';
};

export const setDataCaptureEnabled = (enabled: boolean, storage: Pick<Storage, 'setItem'> = window.localStorage): void => {
    storage.setItem(DATA_CAPTURE_ENABLED_STORAGE_KEY, String(enabled));
};
