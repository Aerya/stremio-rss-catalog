#!/usr/bin/env python3
"""Pont JSON minimal entre Node.js et Parsett (PTT).

Entrée standard : tableau JSON de noms de releases.
Sortie standard : tableau JSON d'objets parsés, dans le même ordre.
"""

import json
import sys

from PTT import parse_title


def main() -> int:
    titles = json.load(sys.stdin)
    if not isinstance(titles, list):
        raise ValueError("Un tableau de titres est attendu")

    parsed = []
    for title in titles:
        value = str(title or "")
        try:
            result = parse_title(value, translate_languages=False)
            parsed.append(result if isinstance(result, dict) else {})
        except Exception as error:  # une release invalide ne doit pas arrêter le lot
            parsed.append({"_error": str(error)})

    json.dump(parsed, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
