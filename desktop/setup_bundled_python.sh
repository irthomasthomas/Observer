# setup_bundled_python.sh
#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_BUNDLE="$SCRIPT_DIR/python-bundle/bin/python3"
PIP="$SCRIPT_DIR/python-bundle/bin/pip3"

# Install dependencies
$PIP install -r requirements.txt
