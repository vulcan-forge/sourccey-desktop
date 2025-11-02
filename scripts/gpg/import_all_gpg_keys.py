import os

# Import all gpg keys
def import_all_gpg_keys():
    os.system('gpg --import ./scripts/gpg/public_key.asc')
    os.system('gpg --import ./scripts/gpg/private_key.asc')
    os.remove("./scripts/gpg/public_key.asc")
    os.remove("./scripts/gpg/private_key.asc")

import_all_gpg_keys()
