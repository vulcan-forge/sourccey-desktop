import sys
import gnupg # pip install python-gnupg
import os

# Check for missing arguments
if len(sys.argv) < 3:
    print("Usage: python generate_gpg_key.py <name> <email> [passphrase]")
    sys.exit(1)

# Get command-line arguments
name = sys.argv[1]
email = sys.argv[2]
if len(sys.argv) == 4:
    passphrase = sys.argv[3]
else:
    passphrase = ""

# Initialize GPG object
gpg = gnupg.GPG()

# Generate new GPG key
input_data = gpg.gen_key_input(
    key_type="RSA",
    key_length=4096,
    name_real=name,
    name_email=email,
    passphrase=passphrase
)
key = gpg.gen_key(input_data)

# Get the directory of the Python script
dir_path = os.path.abspath(os.path.dirname(__file__))

# Export public key to file
public_key_file = os.path.join(dir_path, "public_key.asc")
public_key = str(gpg.export_keys(key.fingerprint, False))
with open(public_key_file, "w") as f:
    f.write(public_key)

# Export private key to file
private_key_file = os.path.join(dir_path, "private_key.asc")
private_key = str(gpg.export_keys(key.fingerprint, True, passphrase=passphrase))
with open(private_key_file, "w") as f:
    f.write(private_key)

print(f"GPG keypair generated and exported to {public_key_file} and {private_key_file}")
