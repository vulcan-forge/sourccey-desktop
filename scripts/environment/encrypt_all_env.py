import os
import gnupg

# Re Encrypts all environment variables to use any new keys
os.system('sops -d ./devops/environment/staging.encrypted.env > ./devops/environment/staging.env')
os.system('sops -d ./devops/environment/staging-local.encrypted.env > ./devops/environment/staging-local.env')
os.system('sops -d ./devops/environment/local.encrypted.env > ./devops/environment/local.env')

key_string = ''

gpg = gnupg.GPG()
gpg_keys = gpg.list_keys()
for index, public_key in enumerate(gpg_keys):
    key_string += public_key['fingerprint']
    if (index < len(gpg_keys) - 1):
        key_string += ','

os.system('sops --pgp {0} -e ./devops/environment/staging.env > ./devops/environment/staging.encrypted.env'.format(key_string))
os.system('sops --pgp {0} -e ./devops/environment/staging-local.env > ./devops/environment/staging-local.encrypted.env'.format(key_string))
os.system('sops --pgp {0} -e ./devops/environment/local.env > ./devops/environment/local.encrypted.env'.format(key_string))

os.remove("./devops/environment/staging.env")
os.remove("./devops/environment/staging-local.env")
os.remove("./devops/environment/local.env")

