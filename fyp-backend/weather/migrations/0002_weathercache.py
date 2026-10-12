from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('weather', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='WeatherCache',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('city_key', models.CharField(db_index=True, max_length=120, unique=True)),
                ('city_name', models.CharField(max_length=120)),
                ('payload', models.JSONField()),
                ('fetched_at', models.DateTimeField(db_index=True)),
            ],
            options={
                'ordering': ['-fetched_at'],
            },
        ),
    ]
