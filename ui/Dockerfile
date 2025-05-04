FROM node:20-alpine

WORKDIR /app

# Copier les fichiers package
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier le code
COPY . .

# Exposer le port
EXPOSE 3000

# Lancer en mode développement par défaut
CMD ["npm", "run", "dev"]