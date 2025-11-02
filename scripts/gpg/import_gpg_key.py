import os

# Imports gpg key
def import_gpg_key():
    os.system('gpg --import ./scripts/gpg/public_key.asc')
    os.system('gpg --import ./scripts/gpg/private_key.asc')
    os.remove("./scripts/gpg/public_key.asc")
    os.remove("./scripts/gpg/private_key.asc")

import_gpg_key()
