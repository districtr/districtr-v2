from django.core.management.base import BaseCommand

from authapi.tokens import mint_service_token


class Command(BaseCommand):
    help = (
        "Mint a service-to-service access token with explicit scopes "
        "(replaces the Auth0 client-credentials flow). Use sparingly and "
        "with short lifetimes; the token is printed to stdout."
    )

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True, help="Service name (sub claim)")
        parser.add_argument(
            "--scopes",
            required=True,
            help="Space-delimited scopes, e.g. 'create:districtr_maps'",
        )
        parser.add_argument(
            "--lifetime-minutes",
            type=int,
            default=15,
            help="Token lifetime in minutes (default 15)",
        )

    def handle(self, *args, **options):
        self.stdout.write(
            mint_service_token(
                options["name"],
                options["scopes"].split(),
                lifetime_minutes=options["lifetime_minutes"],
            )
        )
