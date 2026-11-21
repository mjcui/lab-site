#!/usr/bin/env python3
"""为论文补充卷期号、页码、DOI 与在线链接。

数据来源：Crossref API（query.bibliographic 检索，按标题精确匹配优先）。
用法：python scripts/enrich-papers.py <crossref.json>
"""
import io
import json
import os
import re
import sys

PAPERS_DIR = 'src/content/papers'
PAPER_DIR = 'src/content/papers'

VENUE_LINE = re.compile(r'^venue: ".*"$')
DOI_LINE = re.compile(r'^doi: ".*"$')


def insert_after(text, pattern, block):
    """在匹配到的行后插入 block（block 不含换行符）。"""
    for line in text.split('\n'):
        if pattern.match(line):
            return text.replace(line + '\n', line + '\n' + block + '\n', 1)
    return None


def main():
    data_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/crossref.json'
    items = json.load(io.open(data_path, encoding='utf-8'))

    updated = []
    skipped = []

    for item in items:
        slug = item.get('slug', '')
        if not item.get('matched'):
            skipped.append(slug)
            continue

        path = os.path.join(PAPER_DIR, slug + '.md')
        if not os.path.exists(path):
            skipped.append(slug + ' (无文件)')
            continue

        text = io.open(path, encoding='utf-8').read()
        if '\ndoi:' in text:
            continue

        fields = []
        if item.get('volume'):
            fields.append('volume: "%s"' % item['volume'])
        if item.get('issue'):
            fields.append('issue: "%s"' % item['issue'])
        if item.get('page'):
            fields.append('pages: "%s"' % item['page'].replace('-', '–'))
        if item.get('doi'):
            fields.append('doi: "%s"' % item['doi'])
        if not fields:
            continue

        new_text = insert_after(text, VENUE_LINE, '\n'.join(fields))
        if new_text is None:
            skipped.append(slug + ' (venue 行未匹配)')
            continue

        doi = item.get('doi')
        if doi and 'links:' not in new_text:
            new_text = insert_after(
                new_text, DOI_LINE, 'links:\n  online: "https://doi.org/%s"' % doi)

        io.open(path, 'w', encoding='utf-8', newline='\n').write(new_text)
        updated.append(slug)

    print('已更新 %d 篇' % len(updated))
    if skipped:
        print('跳过:', ', '.join(skipped))


if __name__ == '__main__':
    main()
