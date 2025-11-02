import os
import sys

# Exports gpg key
def export_gpg_key():
    if (len(sys.argv) < 2):
        print("No gpg name or email provided. Example: 'test@testing.com'")
        return

    key = sys.argv[1]
    os.system('gpg --output ./scripts/gpg/public_key.asc --armor --export {0}'.format(key))
    os.system('gpg --output ./scripts/gpg/private_key.asc --armor --export-secret-key {0}'.format(key))

export_gpg_key()
