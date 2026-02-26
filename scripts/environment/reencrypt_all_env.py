import tempfile
from pathlib import Path
import subprocess
import gnupg

BASE_DIR = Path(__file__).resolve().parents[2]
ENV_DIR = BASE_DIR / "devops" / "environment"


def run_sops_decrypt(source_path, dest_path):
    with dest_path.open("wb") as dest_file:
        result = subprocess.run(
            ["sops", "-d", str(source_path)],
            stdout=dest_file,
            stderr=subprocess.PIPE,
            check=False,
        )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace"))


def run_sops_encrypt(source_path, dest_path, pgp_keys):
    with dest_path.open("wb") as dest_file:
        result = subprocess.run(
            ["sops", "--pgp", pgp_keys, "-e", str(source_path)],
            stdout=dest_file,
            stderr=subprocess.PIPE,
            check=False,
        )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace"))


def get_pgp_key_string():
    gpg = gnupg.GPG()
    gpg_keys = gpg.list_keys()
    if not gpg_keys:
        raise RuntimeError("No GPG public keys found in keyring.")
    return ",".join(key["fingerprint"] for key in gpg_keys)


def reencrypt_all():
    encrypted_envs = sorted(ENV_DIR.glob("*.encrypted.env"))
    if not encrypted_envs:
        print(f"No encrypted env files found in {ENV_DIR}")
        return

    pgp_keys = get_pgp_key_string()
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        for encrypted_path in encrypted_envs:
            temp_env = temp_dir_path / encrypted_path.name.replace(".encrypted.env", ".env")
            print(f"Re-encrypting {encrypted_path.name}")
            run_sops_decrypt(encrypted_path, temp_env)
            run_sops_encrypt(temp_env, encrypted_path, pgp_keys)


if __name__ == "__main__":
    reencrypt_all()
