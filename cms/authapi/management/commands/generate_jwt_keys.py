from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Generate an RSA keypair for JWT signing. Store the output as the "
        "JWT_SIGNING_KEY and JWT_VERIFYING_KEY secrets (Fly: "
        "`fly secrets set JWT_SIGNING_KEY=- < private.pem`)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--key-size", type=int, default=2048, help="RSA key size in bits"
        )

    def handle(self, *args, **options):
        private_key = rsa.generate_private_key(
            public_exponent=65537, key_size=options["key_size"]
        )
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("ascii")
        public_pem = (
            private_key.public_key()
            .public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .decode("ascii")
        )
        self.stdout.write("# JWT_SIGNING_KEY (private — keep secret):")
        self.stdout.write(private_pem)
        self.stdout.write("# JWT_VERIFYING_KEY (public — also served via JWKS):")
        self.stdout.write(public_pem)
