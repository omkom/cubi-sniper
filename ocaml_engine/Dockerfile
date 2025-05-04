# Dockerfile OCaml engine
FROM ocaml/opam:alpine

# Installer les outils nécessaires
RUN sudo apk add --no-cache m4 make g++ libev-dev

# Passer en mode OPAM
USER opam
WORKDIR /home/opam/app

# Copier le code OCaml
COPY . .
 
# Installer les dépendances OCaml
RUN opam install yojson dune --yes

# Compiler le projet
RUN eval $(opam env) && dune build TokenDB.exe

# Lancer le binaire
CMD ["dune", "exec", "TokenDB.exe"]
