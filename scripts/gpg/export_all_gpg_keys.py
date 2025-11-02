import os
import sys
import subprocess

# Export all gpg keys
def export_all_gpg_keys():
    os.system('gpg --armor --export > ./scripts/gpg/public_key.asc')
    os.system('gpg --armor --export-secret-key > ./scripts/gpg/private_key.asc')

export_all_gpg_keys()
