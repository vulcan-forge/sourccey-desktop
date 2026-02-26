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
gen_kwargs = {
    "key_type": "RSA",
    "key_length": 4096,
    "name_real": name,
    "name_email": email,
    "passphrase": passphrase,
}
if passphrase == "":
    # Required for batch mode when no passphrase is provided
    gen_kwargs["no_protection"] = True

input_data = gpg.gen_key_input(**gen_kwargs)
key = gpg.gen_key(input_data)

if not key.fingerprint:
    print("Failed to generate GPG key.")
    if hasattr(key, "status") and key.status:
        print(f"Status: {key.status}")
    if hasattr(key, "stderr") and key.stderr:
        print(f"Stderr: {key.stderr}")
    if hasattr(key, "exit_status") and key.exit_status is not None:
        print(f"Exit status: {key.exit_status}")
    sys.exit(1)

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
