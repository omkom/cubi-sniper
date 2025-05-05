# Navigate to the ocaml_engine directory
cd ocaml_engine

# Create the run.sh script
echo '#!/bin/sh
eval $(opam env)
exec dune exec ./TokenDB.exe "$@"' > run.sh

# Make it executable
chmod +x run.sh