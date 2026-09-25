import os
import unicodedata


def strip_diacritics(text: str) -> str:
    """Remove Unicode diacritics (accents/tildes) but keep other characters."""
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def is_ascii(text: str) -> bool:
    try:
        text.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


def main() -> int:
    root = os.getcwd()

    # Collect rename operations bottom-up (files/dirs before parents)
    ops: list[tuple[str, str]] = []
    for dirpath, dirnames, filenames in os.walk(root, topdown=False):
        for name in filenames + dirnames:
            if is_ascii(name):
                continue
            new_name = strip_diacritics(name)
            if new_name == name:
                continue
            old_abs = os.path.join(dirpath, name)
            new_abs = os.path.join(dirpath, new_name)
            ops.append((old_abs, new_abs))

    # Deterministic order: deeper paths first
    ops.sort(key=lambda t: len(t[0]), reverse=True)

    # Collision check
    for old_abs, new_abs in ops:
        if os.path.exists(new_abs) and os.path.realpath(new_abs) != os.path.realpath(old_abs):
            rel = os.path.relpath(new_abs, root)
            raise SystemExit(f"Collision: target already exists: {rel}")

    if not ops:
        print("No non-ASCII filenames found. Nothing to rename.")
        return 0

    print("Renaming (remove diacritics):")
    for old_abs, new_abs in ops:
        print(f"- {os.path.relpath(old_abs, root)} -> {os.path.relpath(new_abs, root)}")

    for old_abs, new_abs in ops:
        os.rename(old_abs, new_abs)

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
