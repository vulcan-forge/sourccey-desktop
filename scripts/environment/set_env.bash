if [ "$1" = "production" ]; then
    echo "Decrypting "$1" credentials"
    sops -d ./devops/environment/production.encrypted.env > .env
elif [ "$1" = "production-local" ]; then
    echo "Decrypting "$1" credentials"
    sops -d ./devops/environment/production-local.encrypted.env > .env
elif [ "$1" = "staging" ]; then
    echo "Decrypting "$1" credentials"
    sops -d ./devops/environment/staging.encrypted.env > .env
elif [ "$1" = "staging-local" ]; then
    echo "Decrypting "$1" credentials"
    sops -d ./devops/environment/staging-local.encrypted.env > .env
elif [ "$1" = "local" ]; then
    echo "Decrypting "$1" credentials"
    sops -d ./devops/environment/local.encrypted.env > .env
fi
