import os
import sys
import gnupg

# Encrypts the .env file into an encrypted file based on the chosen environment
def encrypt():
    if (len(sys.argv) < 2):
        print("No environment arguement provided. Example: 'local'")
        return

    key_string = ''

    gpg = gnupg.GPG()
    gpg_keys = gpg.list_keys()
    for index, public_key in enumerate(gpg_keys):
        key_string += public_key['fingerprint']
        if (index < len(gpg_keys) - 1):
            key_string += ','

    environment = sys.argv[1]
    if (environment == 'production'):
        print("Encrypting {0}".format(environment))
        os.system('sops --pgp {0} -e ./.env > ./devops/environment/production.encrypted.env'.format(key_string))
    elif (environment == 'production-local'):
        print("Encrypting {0}".format(environment))
        os.system('sops --pgp {0} -e ./.env > ./devops/environment/production-local.encrypted.env'.format(key_string))
    elif (environment == 'staging'):
        print("Encrypting {0}".format(environment))
        os.system('sops --pgp {0} -e ./.env > ./devops/environment/staging.encrypted.env'.format(key_string))
    elif (environment == 'staging-local'):
        print("Encrypting {0}".format(environment))
        os.system('sops --pgp {0} -e ./.env > ./devops/environment/staging-local.encrypted.env'.format(key_string))
    elif (environment == 'local'):
        print("Encrypting {0}".format(environment))
        os.system('sops --pgp {0} -e ./.env > ./devops/environment/local.encrypted.env'.format(key_string))

encrypt()
