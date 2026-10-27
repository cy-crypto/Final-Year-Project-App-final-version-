from django.contrib.staticfiles.management.commands.runserver import Command as StaticfilesRunserverCommand


class Command(StaticfilesRunserverCommand):
    # Listen on all interfaces, port 8080, so phones on the same Wi-Fi can reach the
    # backend at the address the app uses (services/api.ts). `runserver <addr:port>` still overrides.
    default_addr = '0.0.0.0'
    default_port = '8080'
