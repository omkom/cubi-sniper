# Base stage
FROM python:3.11-slim as base

WORKDIR /app

# Installer les dépendances système
RUN apt-get update && apt-get install -y \
    build-essential \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copier et installer requirements
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Collector stage
FROM base as collector

# Copier uniquement les scripts de collecte de données
COPY data_collector.py .

# Créer les dossiers nécessaires
RUN mkdir -p training_data

# Point d'entrée pour la collecte de données
ENTRYPOINT ["python", "data_collector.py"]

# Main AI service stage
FROM base as main

# Copier tout le code
COPY . .

# Créer les dossiers nécessaires
RUN mkdir -p models training_data

# Exposer le port
EXPOSE 8000

# Commande par défaut - serveur Flask
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120", "serve:app"]