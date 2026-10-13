// Never put nmcli, D-Bus, OS errors, profile IDs or secret values on a kiosk.
export function networkErrorMessage(error: unknown, action: string): string {
    const message = String(error);
    const lower = message.toLowerCase();
    if (/access is denied|os error 5|not authorized|permission denied|access was denied/.test(lower)) {
        return 'Network access was denied. Run kiosk network permission repair, then try again.';
    }
    if (/secrets|passwd-file|authentication|authenticate|wrong password/.test(lower)) {
        if (action.toLowerCase().includes('ethernet')) {
            return "This Ethernet network requires authentication. Ask your IT team to configure the kiosk's wired network credentials.";
        }
        return "Could not authenticate with this Wi-Fi network. Check the password and try again. If it still fails, ask your IT team to check the network's security settings.";
    }
    if (/dhcp|ip configuration|did not assign an ip/.test(lower)) {
        return 'The network did not assign an IP address. Check the router or contact your IT team.';
    }
    if (/timed out|timeout|too long to respond/.test(lower)) {
        return 'The network took too long to respond. Check the connection and try again.';
    }
    // The backend supplies these bounded, actionable messages. Reject anything
    // containing system diagnostics, including appended raw errors.
    if (
        !/warning:|error:|nmcli|journalctl|dbus|d-bus|nm_connection|os error|\n/i.test(message) &&
        /^(This network uses enterprise Wi-Fi|This Wi-Fi security type|This Ethernet adapter|Plug an Ethernet cable|Could not determine the network|A password is required|Open networks do not require|The Wi-Fi (password|network name)|Robot hotspot mode is active|Could not securely prepare|The network service is unavailable|Could not complete the network request|This Wi-Fi network is no longer in range|Could not (read|scan|connect|disconnect).+Try again\.)/.test(
            message
        )
    ) {
        return message;
    }
    return `${action}. Check the connection and try again.`;
}
