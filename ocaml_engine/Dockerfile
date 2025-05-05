# Dockerfile OCaml engine
FROM ocaml/opam:alpine

# Installer les outils nécessaires
RUN sudo apk add --no-cache m4 make g++ libev-dev

# Passer en mode OPAM
USER opam
WORKDIR /home/opam/app

# Copier le code OCaml
COPY --chown=opam:opam . .
 
# Installer les dépendances OCaml et compiler
RUN opam install yojson dune --yes
RUN eval $(opam env) && dune build

# Create the run.sh script properly
RUN echo '#!/bin/sh\neval $(opam env)\nexec dune exec ./TokenDB.exe "$@"' > run.sh && chmod +x run.sh

# Exposer le volume pour les fichiers partagés
VOLUME /home/opam/app

# Démarrer le binaire compilé
CMD ["sh", "-c", "eval $(opam env) && dune exec ./TokenDB.exe"]