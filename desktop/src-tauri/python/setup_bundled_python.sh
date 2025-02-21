# Modified setup_bundled_python.sh
#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_BUNDLE="$SCRIPT_DIR/python-bundle/bin/python3"
PIP="$SCRIPT_DIR/python-bundle/bin/pip3"
# Install dependencies with target flag
$PIP install -r requirements.txt --target="$SCRIPT_DIR/python-bundle/lib/python3.10/site-packages/"
