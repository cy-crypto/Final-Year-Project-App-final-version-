from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Check user_id column in tasks_task table'

    def handle(self, *args, **options):
        query = """
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'tasks_task' 
        AND column_name = 'user_id';
        """
        
        try:
            with connection.cursor() as cursor:
                cursor.execute(query)
                results = cursor.fetchall()
                
                if results:
                    self.stdout.write(self.style.SUCCESS(f"Found user_id column:"))
                    for row in results:
                        self.stdout.write(f"  Column: {row[0]}, Type: {row[1]}")
                else:
                    self.stdout.write(self.style.WARNING("No user_id column found in tasks_task table"))
                    
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error executing query: {e}"))
