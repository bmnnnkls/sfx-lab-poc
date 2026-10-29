#!/usr/bin/env python3
"""Checks relative links in the docs: the target file exists and an #anchor matches a heading in it.

Run from the repository root: python3 scripts/check-doc-links.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINK = re.compile(r'\]\(([^)\s]+)\)')


def slugs(path):
    """GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens, repeats numbered."""
    found, seen, fence = set(), {}, False
    for line in path.read_text().split('\n'):
        if line.lstrip().startswith('```'):
            fence = not fence
        if fence or not re.match(r'^#{1,6} ', line):
            continue
        slug = re.sub(r'[^\w\- ]', '', re.sub(r'^#+ ', '', line).strip().lower()).replace(' ', '-')
        n = seen.get(slug, 0)
        seen[slug] = n + 1
        found.add(slug if n == 0 else f'{slug}-{n}')
    return found


def check(path):
    problems, fence = [], False
    for number, line in enumerate(path.read_text().split('\n'), 1):
        if line.lstrip().startswith('```'):
            fence = not fence
        if fence:
            continue
        for match in LINK.finditer(line):
            target = match.group(1)
            if re.match(r'^[a-z]+:', target):
                continue
            file, _, anchor = target.partition('#')
            resolved = path if file == '' else path.parent / re.sub(r':\d+(-\d+)?$', '', file)
            where = f'{path.relative_to(ROOT)}:{number}'
            if not resolved.exists():
                problems.append(f'{where}: no such file: {target}')
            elif anchor and resolved.suffix == '.md' and anchor not in slugs(resolved):
                problems.append(f'{where}: no such heading: {target}')
    return problems


files = [ROOT / 'README.md', ROOT / 'ARCHITECTURE.md', *sorted((ROOT / 'docs').glob('**/*.md'))]
problems = [p for f in files for p in check(f)]
print('\n'.join(problems) or f'{len(files)} files, all links resolve')
sys.exit(1 if problems else 0)
