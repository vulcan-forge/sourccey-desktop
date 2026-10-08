#!/bin/sh
# Unpack tooling into /tmp; do not install it or start a NetworkManager daemon.
set -eu
task_dir=$(mktemp -d /tmp/sourccey-wifi-nmcli.XXXXXX)
cd "$task_dir"
apt-get download network-manager=1.46.0-1ubuntu2 libnm0=1.46.0-1ubuntu2
mkdir extracted
for package in ./*.deb; do
    dpkg-deb -x "$package" extracted
done
export LD_LIBRARY_PATH="$task_dir/extracted/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
"$task_dir/extracted/usr/bin/nmcli" --version
printf 'VALIDATION_TOOL_DIR=%s\n' "$task_dir"
if [ "$#" -ge 2 ]; then
    validator="$1"
    fixtures="$2"
    shift 2
    python3 "$validator" "$fixtures" "$task_dir/extracted/usr/bin/nmcli" "$@"
fi
