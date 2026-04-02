import sys

try:
    if not sys.path[0]:
        del sys.path[0]
except AttributeError:
    pass
except IndexError:
    pass

# Replace argv[0] with our executable instead of the script name.
try:
    if sys.argv[0][-14:].upper() == ".__SCRIPT__.PY":
        sys.argv[0] = sys.argv[0][:-14]
        sys.orig_argv[0] = sys.argv[0]
except AttributeError:
    pass
except IndexError:
    pass

from pip._internal.cli.main import main
sys.exit(main())
