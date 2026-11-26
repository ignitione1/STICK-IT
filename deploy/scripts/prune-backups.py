#!/usr/bin/env python3
"""Keep the newest completed scheduled bundles; ignore all other files."""
import argparse
import re
from pathlib import Path

NAME = re.compile(r'^\d{8}T\d{6}Z-\d+$')
FILES = {'database.dump', 'uploads.tar.gz', 'SHA256SUMS'}


def prune(root: Path, keep: int) -> None:
    if keep < 1:
        raise ValueError('At least one backup must be retained')
    completed = []
    for entry in root.iterdir():
        if entry.is_symlink() or not entry.is_dir() or not NAME.fullmatch(entry.name):
            continue
        children = list(entry.iterdir())
        if {child.name for child in children} != FILES:
            continue
        if not all(child.is_file() and not child.is_symlink() for child in children):
            continue
        completed.append(entry)
    completed.sort(key=lambda entry: entry.name, reverse=True)
    for entry in completed[keep:]:
        for name in FILES:
            (entry / name).unlink()
        entry.rmdir()
        print(f'Removed old backup: {entry.name}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--keep', type=int, default=7)
    args = parser.parse_args()
    prune(args.directory, args.keep)
