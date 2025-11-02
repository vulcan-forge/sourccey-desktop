import os
import sys

# Decrypts the associated environment's .env file
def decrypt():
    environment = 'local'
    if (len(sys.argv) > 1):
        environment = sys.argv[1]

    os.system('bash ./scripts/environment/set_env.bash {0}'.format(environment))

decrypt()
